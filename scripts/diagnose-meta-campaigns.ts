/**
 * Lists Meta campaign names from the last N days with how
 * mapMetaCampaign() classifies each. Quick way to verify whether
 * the `considering` stage on /funnel/strategy shows 0 because (a)
 * no retargeting campaigns ran, or (b) the heuristic doesn't
 * recognize the names that did run.
 */
import { db } from "@/lib/db";
import { metaAdsDaily } from "@/lib/schema";
import { gte, sql, sum } from "drizzle-orm";
import { mapMetaCampaign } from "@/lib/funnel/classify";

const DAYS = Number(process.argv[2] ?? "30");

async function main() {
  const since = new Date();
  since.setDate(since.getDate() - DAYS);

  const rows = await db
    .select({
      campaignName: metaAdsDaily.campaignName,
      impressions: sum(metaAdsDaily.impressions).mapWith(Number),
      clicks: sum(metaAdsDaily.clicks).mapWith(Number),
      cost: sum(metaAdsDaily.cost).mapWith(Number),
    })
    .from(metaAdsDaily)
    .where(gte(metaAdsDaily.date, since))
    .groupBy(metaAdsDaily.campaignName)
    .orderBy(sql`SUM(${metaAdsDaily.impressions}) DESC`);

  console.log(`\nMeta campaigns active in last ${DAYS} days:\n`);
  console.log(
    [
      "kind".padEnd(12),
      "impressions".padStart(13),
      "clicks".padStart(8),
      "cost $".padStart(9),
      "campaign name",
    ].join("  "),
  );
  console.log("-".repeat(110));

  const tally: Record<string, { impr: number; campaigns: number }> = {
    cold: { impr: 0, campaigns: 0 },
    retargeting: { impr: 0, campaigns: 0 },
    unknown: { impr: 0, campaigns: 0 },
  };

  for (const r of rows) {
    const kind = mapMetaCampaign(r.campaignName);
    const impr = r.impressions ?? 0;
    tally[kind].impr += impr;
    tally[kind].campaigns += 1;
    console.log(
      [
        kind.padEnd(12),
        impr.toLocaleString().padStart(13),
        (r.clicks ?? 0).toLocaleString().padStart(8),
        `$${((r.cost ?? 0) / 100).toFixed(2)}`.padStart(9),
        r.campaignName ?? "(null)",
      ].join("  "),
    );
  }

  console.log("-".repeat(110));
  console.log(`\nSummary (last ${DAYS}d):`);
  for (const kind of ["cold", "retargeting", "unknown"] as const) {
    const t = tally[kind];
    console.log(
      `  ${kind.padEnd(12)} ${String(t.campaigns).padStart(3)} campaigns  ${t.impr.toLocaleString().padStart(13)} impressions`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
