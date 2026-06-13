/**
 * Dedup order-derived utm_attribution rows.
 *
 * upsertOrder() used to insert a touch row for every UTM-tagged order on
 * EVERY sync pass — the 2h extract-shopify cron (25h overlap window)
 * multiplied each such order into hundreds of identical rows (one visitor
 * had 194). Fixed at the source in the same change that ships this script;
 * this cleans the accumulated duplicates.
 *
 * Scope: only order-derived rows — fw_distinct_id IS NULL AND session_id
 * IS NULL (storefront-captured touches always carry one or both). Within
 * each duplicate group (visitor_id + all five UTM fields + landing_page),
 * keeps ONE row: a converted row if the group has one (preserves the
 * attribution invariant §4 conversion mark), else the earliest.
 *
 * Usage:
 *   tsx scripts/cleanup-utm-duplicate-touches.ts            # dry-run (default)
 *   tsx scripts/cleanup-utm-duplicate-touches.ts --apply    # delete
 *
 * Run against prod:
 *   dotenv -e .env.production.local -- tsx scripts/cleanup-utm-duplicate-touches.ts --apply
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

const apply = process.argv.includes("--apply");

// Rank rows within each duplicate group; everything ranked > 1 is a dupe.
const RANKED = sql`
  SELECT id, row_number() OVER (
    PARTITION BY visitor_id, source, medium, campaign, term, content, landing_page
    ORDER BY converted DESC, captured_at ASC, id ASC
  ) AS rn
  FROM utm_attribution
  WHERE fw_distinct_id IS NULL AND session_id IS NULL AND visitor_id IS NOT NULL
`;

const counts = await db.execute(sql`
  SELECT count(*) FILTER (WHERE rn > 1)::int AS dupes,
         count(*) FILTER (WHERE rn = 1)::int AS keepers
  FROM (${RANKED}) t
`);
const { dupes, keepers } = (counts.rows[0] ?? { dupes: 0, keepers: 0 }) as {
  dupes: number;
  keepers: number;
};
console.log(`Order-derived touch groups: ${keepers} keepers, ${dupes} duplicate rows`);

if (!apply) {
  console.log("[DRY RUN] pass --apply to delete");
  process.exit(0);
}
if (dupes === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

const result = await db.execute(sql`
  DELETE FROM utm_attribution
  WHERE id IN (SELECT id FROM (${RANKED}) t WHERE rn > 1)
`);
console.log(`Deleted ${(result as { rowCount?: number }).rowCount ?? "?"} duplicate rows.`);
process.exit(0);
