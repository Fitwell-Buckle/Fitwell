import { backfillPostHogDaily } from "@/lib/analytics/posthog-extract";

/**
 * Backfill posthog_daily rollups for a date range.
 *
 *   node --env-file=.env.local --import tsx/esm scripts/backfill-posthog.ts <from> <to>
 *
 * Dates are YYYY-MM-DD (UTC). `to` defaults to yesterday; `from` defaults to
 * 30 days before `to`.
 */
async function main() {
  const [fromArg, toArg] = process.argv.slice(2);

  const to = toArg ? new Date(`${toArg}T00:00:00Z`) : new Date();
  if (!toArg) to.setUTCDate(to.getUTCDate() - 1);

  const from = fromArg
    ? new Date(`${fromArg}T00:00:00Z`)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    console.error("Usage: backfill-posthog.ts <from YYYY-MM-DD> <to YYYY-MM-DD>");
    process.exit(1);
  }

  const start = Date.now();
  console.log(
    `Backfilling posthog_daily ${from.toISOString().split("T")[0]} → ${to
      .toISOString()
      .split("T")[0]} ...`,
  );

  const { days, rows } = await backfillPostHogDaily(from, to);

  console.log(
    `Done in ${Math.round((Date.now() - start) / 1000)}s — ${days} days, ${rows} rows.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
