/**
 * One-time historical import of Shopify orders + customers.
 *
 * REQUIRES the `read_all_orders` scope to be deployed + re-authorized. Without
 * it the Shopify Orders API is capped to the last ~60 days, so this script can
 * only reach further back once the scope is live (verify: the access probe's
 * "Earliest order API returns" should predate the window you're importing).
 *
 * Idempotent — upserts by shopify_id, safe to re-run. Customers (read_customers,
 * no 60-day cap) come in first, then orders (which also upsert their customer).
 *
 * Usage (prod), suppressing PostHog so ~1k historical orders don't emit
 * attribution events dated "now":
 *   vercel ... env pull .env.production.local --environment=production
 *   # strip the PostHog key so captureEvent() no-ops (DB attribution still runs):
 *   grep -v '^NEXT_PUBLIC_POSTHOG_KEY=' .env.production.local > .env.import && mv .env.import .env.production.local
 *   dotenv -e .env.production.local -- node --import tsx/esm scripts/import-history.ts 2024-02-01
 *   rm -f .env.production.local
 */
import { syncRecentOrders, syncRecentCustomers } from "@/lib/shopify/sync";
import { flushEvents } from "@/lib/analytics/posthog";

const sinceArg = process.argv[2] ?? "2024-02-01";
const since = new Date(`${sinceArg}T00:00:00Z`);
if (Number.isNaN(since.getTime())) {
  console.error(`Invalid since date: ${sinceArg}`);
  process.exit(1);
}

console.log(`Historical import since ${since.toISOString()} ...`);

console.log("→ Customers");
const customers = await syncRecentCustomers(since);
console.log("  customers:", JSON.stringify(customers));

console.log("→ Orders (also upserts each order's customer + line items + money fields)");
const orders = await syncRecentOrders(since);
console.log("  orders:", JSON.stringify(orders));

await flushEvents(); // no-op if PostHog key was stripped
console.log("Done.");
process.exit(0);
