/**
 * Backfill: map existing influencer rows into the unified creator system
 * (decision 2026-06-12 in specs/strategy/creator-program.md).
 *
 * For each influencer without a creator_id:
 *   - reuse the creator whose (platform, handle) matches, else create one
 *     (status 'active' — these are engaged relationships, not prospects)
 *   - copy customer link, assigned collections, notes
 *   - create a creator_platform record when handle+platform are present
 *   - migrate contact_email + influencer_contact rows into creator_email
 *     (contact rows get portal_access=true — they were the portal allowlist)
 *   - stamp influencer.creator_id and influencer_order.creator_id
 *
 * Idempotent: influencers that already have creator_id are skipped; emails
 * and platform records upsert on their unique keys.
 *
 * Usage:
 *   dotenv -e .env.local -- tsx scripts/backfill-influencers-to-creators.ts [--dry-run]
 */
import { and, eq, isNull } from "drizzle-orm";
import { normalizeHandle } from "@/lib/creators/scoring";

const dryRun = process.argv.includes("--dry-run");

const { db } = await import("@/lib/db");
const { creator, creatorEmail, creatorPlatform, influencer, influencerOrder } =
  await import("@/lib/schema");

// Oliver's table stores long platform names; creator_platform uses short codes.
const PLATFORM_CODES: Record<string, string> = {
  instagram: "ig",
  ig: "ig",
  youtube: "yt",
  yt: "yt",
  tiktok: "tt",
  tt: "tt",
};

const pending = await db
  .select()
  .from(influencer)
  .where(isNull(influencer.creatorId));

console.log(`${pending.length} influencer rows without creator_id`);
if (dryRun) {
  for (const inf of pending) {
    console.log(`  would migrate: ${inf.name} (${inf.platform ?? "?"} ${inf.handle ?? "no handle"})`);
  }
  process.exit(0);
}

let migrated = 0;
let linkedExisting = 0;

for (const inf of pending) {
  const platformCode = inf.platform
    ? (PLATFORM_CODES[inf.platform.trim().toLowerCase()] ?? null)
    : null;
  const handle = inf.handle ? normalizeHandle(inf.handle) : null;

  // Reuse a creator already imported from the research CSV when the
  // platform+handle matches — that's the same human.
  let creatorId: string | null = null;
  if (platformCode && handle) {
    const existing = await db
      .select({ creatorId: creatorPlatform.creatorId })
      .from(creatorPlatform)
      .where(
        and(
          eq(creatorPlatform.platform, platformCode),
          eq(creatorPlatform.handle, handle),
        ),
      );
    if (existing.length > 0) {
      creatorId = existing[0].creatorId;
      linkedExisting++;
      // The relationship is live — upgrade prospect → active.
      await db
        .update(creator)
        .set({
          status: "active",
          customerId: inf.customerId,
          assignedCollectionIds: inf.assignedCollectionIds,
          updatedAt: new Date(),
        })
        .where(eq(creator.id, creatorId));
    }
  }

  if (!creatorId) {
    const inserted = await db
      .insert(creator)
      .values({
        name: inf.name,
        primaryPlatform: platformCode,
        status: "active",
        customerId: inf.customerId,
        assignedCollectionIds: inf.assignedCollectionIds,
        notes: inf.notes,
      })
      .returning({ id: creator.id });
    creatorId = inserted[0].id;
    migrated++;

    if (platformCode && handle) {
      await db
        .insert(creatorPlatform)
        .values({
          creatorId,
          platform: platformCode,
          handle,
          dataSource: "manual",
        })
        .onConflictDoNothing();
    }
  }

  // Emails: the inline contact_email plus the portal-allowlist contacts.
  const emails: { email: string; portalAccess: boolean }[] = [];
  if (inf.contactEmail) {
    emails.push({ email: inf.contactEmail.toLowerCase(), portalAccess: false });
  }
  const contacts = await db.query.influencerContact.findMany({
    where: (c, { eq: eqOp }) => eqOp(c.influencerId, inf.id),
  });
  for (const c of contacts) {
    const existing = emails.find((e) => e.email === c.email.toLowerCase());
    if (existing) existing.portalAccess = true;
    else emails.push({ email: c.email.toLowerCase(), portalAccess: true });
  }
  for (const e of emails) {
    await db
      .insert(creatorEmail)
      .values({
        creatorId,
        email: e.email,
        kind: "personal",
        source: "manual",
        portalAccess: e.portalAccess,
      })
      .onConflictDoUpdate({
        target: [creatorEmail.creatorId, creatorEmail.email],
        set: { portalAccess: e.portalAccess },
      });
  }

  await db
    .update(influencer)
    .set({ creatorId })
    .where(eq(influencer.id, inf.id));
  await db
    .update(influencerOrder)
    .set({ creatorId })
    .where(eq(influencerOrder.influencerId, inf.id));
}

console.log(
  `Done. created=${migrated} linked-to-existing=${linkedExisting} (of ${pending.length})`,
);
process.exit(0);
