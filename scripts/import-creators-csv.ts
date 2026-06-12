/**
 * Import the creator research dataset (Fitwell_Creators_CrossPlatform.csv)
 * into the unified creator tables. Idempotent (safe to re-run): creator
 * identity is resolved through creator_platform's unique (platform, handle)
 * key — re-importing updates rows instead of duplicating them.
 *
 * Usage:
 *   tsx scripts/import-creators-csv.ts <path-to-csv> --dry-run   (no DB needed)
 *
 * Run against dev:
 *   dotenv -e .env.local -- tsx scripts/import-creators-csv.ts \
 *     ~/Downloads/Fitwell_Creators_CrossPlatform.csv
 *
 * Run against prod (after dev verifies, after migration 0064 is applied):
 *   dotenv -e .env.production.local -- tsx scripts/import-creators-csv.ts \
 *     ~/Downloads/Fitwell_Creators_CrossPlatform.csv
 *
 * Expected counts from the May 2026 research pass: ~735 creators,
 * ~839 platform rows (104 multi-platform).
 */
import { readFileSync } from "fs";
import { eq, inArray } from "drizzle-orm";
import { transformCsv, type TransformedCreator } from "@/lib/creators/import";

const csvPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!csvPath) {
  console.error(
    "usage: tsx scripts/import-creators-csv.ts <csv-path> [--dry-run]",
  );
  process.exit(1);
}

const asOf = new Date();
const snapshotDate = asOf.toISOString().slice(0, 10);

const raw = readFileSync(csvPath, "utf8");
const { creators, issues } = transformCsv(raw, asOf);

console.log(`Parsed ${creators.length} creators (${issues.length} skipped rows)`);
for (const issue of issues) {
  console.log(`  ! row ${issue.rowIndex}: ${issue.reason}`);
}
const multi = creators.filter((c) => c.platforms.length > 1).length;
const partial = creators.filter((c) =>
  c.platforms.some((p) => p.fitScorePartial),
).length;
console.log(`  multi-platform: ${multi} · partial-fit rows: ${partial}`);

if (dryRun) {
  const top = [...creators]
    .sort((a, b) => b.crossPlatformFit - a.crossPlatformFit)
    .slice(0, 10);
  console.log("\nTop 10 by cross_platform_fit (dry run, nothing written):");
  for (const c of top) {
    console.log(
      `  ${c.crossPlatformFit.toFixed(1).padStart(5)}  ${c.name} (${c.primaryPlatform ?? "?"})`,
    );
  }
  process.exit(0);
}

// DB imports are lazy so --dry-run works without DATABASE_URL.
const { db } = await import("@/lib/db");
const { creator, creatorEmail, creatorPlatform, creatorStatsDaily } =
  await import("@/lib/schema");

let created = 0;
let updated = 0;

async function upsertCreator(t: TransformedCreator): Promise<void> {
  // Resolve identity via any existing platform record (platform+handle).
  const keys = t.platforms.map((p) => ({
    platform: p.platform,
    handle: p.handle,
  }));
  const existing = await db
    .select({
      id: creatorPlatform.id,
      creatorId: creatorPlatform.creatorId,
      platform: creatorPlatform.platform,
      handle: creatorPlatform.handle,
    })
    .from(creatorPlatform)
    .where(
      inArray(
        creatorPlatform.handle,
        keys.map((k) => k.handle),
      ),
    );
  const matches = existing.filter((e) =>
    keys.some((k) => k.platform === e.platform && k.handle === e.handle),
  );

  let creatorId: string;
  if (matches.length > 0) {
    creatorId = matches[0].creatorId;
    await db
      .update(creator)
      .set({
        name: t.name,
        primaryPlatform: t.primaryPlatform,
        crossPlatformFit: t.crossPlatformFit,
        updatedAt: new Date(),
      })
      .where(eq(creator.id, creatorId));
    updated++;
  } else {
    const inserted = await db
      .insert(creator)
      .values({
        name: t.name,
        primaryPlatform: t.primaryPlatform,
        crossPlatformFit: t.crossPlatformFit,
        notes: t.notes,
      })
      .returning({ id: creator.id });
    creatorId = inserted[0].id;
    created++;
  }

  for (const p of t.platforms) {
    const platformRow = await db
      .insert(creatorPlatform)
      .values({
        creatorId,
        platform: p.platform,
        handle: p.handle,
        profileUrl: p.profileUrl,
        bio: p.bio,
        dataSource: p.dataSource,
        isBusinessAccount: p.isBusinessAccount,
        isVerified: p.isVerified,
        externalUrl: p.externalUrl,
        watchScore: p.watchScore,
        watchConfidence: p.watchConfidence,
        fitScore: p.fitScore,
        fitScorePartial: p.fitScorePartial,
        lastRefreshedAt: asOf,
      })
      .onConflictDoUpdate({
        target: [creatorPlatform.platform, creatorPlatform.handle],
        set: {
          creatorId,
          profileUrl: p.profileUrl,
          bio: p.bio,
          dataSource: p.dataSource,
          isBusinessAccount: p.isBusinessAccount,
          isVerified: p.isVerified,
          externalUrl: p.externalUrl,
          watchScore: p.watchScore,
          watchConfidence: p.watchConfidence,
          fitScore: p.fitScore,
          fitScorePartial: p.fitScorePartial,
          lastRefreshedAt: asOf,
        },
      })
      .returning({ id: creatorPlatform.id });

    await db
      .insert(creatorStatsDaily)
      .values({
        creatorPlatformId: platformRow[0].id,
        snapshotDate,
        followers: p.stats.followers,
        engagementRatePct: p.stats.engagementRatePct,
        avgLikes: p.stats.avgLikes,
        avgComments: p.stats.avgComments,
        avgViews: p.stats.avgViews,
        lastPostDate: p.stats.lastPostDate
          ? p.stats.lastPostDate.toISOString().slice(0, 10)
          : null,
        postsInWindow: p.stats.postsInWindow,
      })
      .onConflictDoUpdate({
        target: [
          creatorStatsDaily.creatorPlatformId,
          creatorStatsDaily.snapshotDate,
        ],
        set: {
          followers: p.stats.followers,
          engagementRatePct: p.stats.engagementRatePct,
          avgLikes: p.stats.avgLikes,
          avgComments: p.stats.avgComments,
          avgViews: p.stats.avgViews,
          lastPostDate: p.stats.lastPostDate
            ? p.stats.lastPostDate.toISOString().slice(0, 10)
            : null,
          postsInWindow: p.stats.postsInWindow,
        },
      });
  }

  for (const e of t.emails) {
    await db
      .insert(creatorEmail)
      .values({
        creatorId,
        email: e.email,
        kind: e.kind,
        source: e.source,
      })
      .onConflictDoUpdate({
        target: [creatorEmail.creatorId, creatorEmail.email],
        set: { kind: e.kind, source: e.source },
      });
  }
}

for (let i = 0; i < creators.length; i++) {
  await upsertCreator(creators[i]);
  if ((i + 1) % 50 === 0) console.log(`  ... ${i + 1}/${creators.length}`);
}

console.log(
  `\nDone. created=${created} updated=${updated} (snapshot date ${snapshotDate})`,
);
console.log(
  "Sanity-check expected totals: ~735 creators, ~839 creator_platform rows.",
);
process.exit(0);
