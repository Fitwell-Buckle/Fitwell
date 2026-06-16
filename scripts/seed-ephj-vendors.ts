/**
 * Seed the EPHJ Geneva 2026 trade show and its vendor worklist from the
 * prospecting spreadsheet (scripts/data/ephj-2026-vendors.json, generated from
 * EPHJ_2026_cleaned.xlsx).
 *
 * Idempotent (safe to re-run): the show is matched by name; vendors upsert on
 * the unique (trade_show_id, company_name) index, so re-running refreshes the
 * seed fields (booth, category, side, priority, seed notes, contact) WITHOUT
 * touching on-floor capture (visited / notes / card / voice notes / follow-up /
 * pipeline links).
 *
 * Run against dev:
 *   npm run seed:ephj
 * Run against prod (after the migration is applied to prod):
 *   dotenv -e .env.production.local -- tsx scripts/seed-ephj-vendors.ts
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tradeShow, tradeShowVendor } from "@/lib/schema";

const SHOW = {
  name: "EPHJ Geneva 2026",
  location: "Palexpo",
  city: "Geneva",
  country: "Switzerland",
  startsOn: "2026-06-16",
  endsOn: "2026-06-19",
  sourceChannel: "b2b_trade_shows_industry",
};

interface SeedVendor {
  booth: string | null;
  companyName: string;
  category: string | null;
  side: "supplier" | "customer" | "both";
  contactName: string | null;
  email: string | null;
  responseRaw: string | null;
  meetingRaw: string | null;
  seedNotes: string | null;
  priority: boolean;
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const vendors: SeedVendor[] = JSON.parse(
    readFileSync(join(here, "data", "ephj-2026-vendors.json"), "utf8"),
  );

  // Upsert the show by name.
  let show = await db.query.tradeShow.findFirst({
    where: eq(tradeShow.name, SHOW.name),
  });
  if (!show) {
    const [created] = await db.insert(tradeShow).values(SHOW).returning();
    show = created;
    console.log(`Created show "${SHOW.name}" (${show.id})`);
  } else {
    await db
      .update(tradeShow)
      .set({ ...SHOW, updatedAt: new Date() })
      .where(eq(tradeShow.id, show.id));
    console.log(`Updated show "${SHOW.name}" (${show.id})`);
  }

  let inserted = 0;
  let updated = 0;
  for (const v of vendors) {
    const existing = await db.query.tradeShowVendor.findFirst({
      where: and(
        eq(tradeShowVendor.tradeShowId, show.id),
        eq(tradeShowVendor.companyName, v.companyName),
      ),
      columns: { id: true },
    });
    // Only the seed-derived fields — never overwrite on-floor capture.
    const seedFields = {
      booth: v.booth,
      category: v.category,
      side: v.side,
      priority: v.priority,
      contactName: v.contactName,
      email: v.email,
      seedNotes: v.seedNotes,
      responseRaw: v.responseRaw,
      meetingRaw: v.meetingRaw,
    };
    if (existing) {
      await db
        .update(tradeShowVendor)
        .set({ ...seedFields, updatedAt: new Date() })
        .where(eq(tradeShowVendor.id, existing.id));
      updated++;
    } else {
      await db.insert(tradeShowVendor).values({
        tradeShowId: show.id,
        companyName: v.companyName,
        ...seedFields,
      });
      inserted++;
    }
  }

  console.log(
    `Vendors: ${inserted} inserted, ${updated} updated (${vendors.length} total).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
