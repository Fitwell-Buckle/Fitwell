/**
 * Backfill order.link_method = 'self_report' for every order that has a
 * Grapevine survey response but no existing link_method.
 *
 * Per specs/invariants/attribution.md §4, self_report is the highest-priority
 * method on read, but link_method records the technical mechanism that
 * established the link. So we ONLY fill in the 'self_report' value where
 * link_method is currently NULL — leaving pixel/email_match values alone
 * preserves their meaning for code that filters by link_method (e.g.
 * src/lib/analytics/attribution.ts).
 *
 * Idempotent: safe to re-run. A row that's already 'self_report' stays
 * 'self_report'; a row that's 'pixel' or 'email_match' is left alone.
 *
 * Usage:
 *   tsx scripts/backfill-self-report-link-method.ts            # against the DB
 *                                                              # in your env
 *   tsx scripts/backfill-self-report-link-method.ts --dry-run  # count only
 *
 * Run against prod:
 *   dotenv -e .env.production.local -- tsx scripts/backfill-self-report-link-method.ts
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

const dryRun = process.argv.includes("--dry-run");

// Find orders that have a survey response AND no current link_method.
const candidates = await db.execute(sql`
  select count(distinct o.id) as n
  from "order" o
  join attribution_survey_response asr
    on asr.order_id = o.id and asr.provider = 'grapevine'
  where o.link_method is null
`);
const toUpdate = Number(candidates.rows[0]?.n ?? 0);

console.log(`Orders to update: ${toUpdate}`);

if (dryRun) {
  console.log("[DRY RUN] no writes performed");
  process.exit(0);
}

if (toUpdate === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

const result = await db.execute(sql`
  update "order" o
  set link_method = 'self_report'
  where o.link_method is null
    and exists (
      select 1 from attribution_survey_response asr
      where asr.order_id = o.id and asr.provider = 'grapevine'
    )
`);

const rowCount = (result as { rowCount?: number }).rowCount ?? toUpdate;
console.log(`Updated ${rowCount} order rows to link_method='self_report'`);

// Sanity-check the post-state.
const after = await db.execute(sql`
  select coalesce(o.link_method, '<null>') as lm, count(*) as n
  from "order" o
  join attribution_survey_response asr
    on asr.order_id = o.id and asr.provider = 'grapevine'
  group by 1 order by n desc
`);
console.log("\nSurvey-linked orders, link_method distribution after backfill:");
for (const r of after.rows) {
  console.log(`  ${String(r.lm).padEnd(16)} ${r.n}`);
}

process.exit(0);
