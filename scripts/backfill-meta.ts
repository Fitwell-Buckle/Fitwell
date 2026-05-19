import { extractMetaAdsDaily } from "@/lib/analytics/meta-ads";

async function main() {
  const start = Date.now();
  let totalRows = 0;
  for (let i = 1; i <= 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    try {
      const rows = await extractMetaAdsDaily(date);
      totalRows += rows;
      console.log(`${dateStr}: ${rows} rows`);
    } catch (err) {
      console.error(`${dateStr}: ERROR -`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`\nDone: ${totalRows} rows in ${Math.round((Date.now() - start) / 1000)}s`);
  process.exit(0);
}
main();
