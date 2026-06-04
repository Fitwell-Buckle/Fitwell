/**
 * One-off backfill: populate the order money-breakdown columns
 * (total_tax, total_discounts, total_shipping, total_refunded, cancelled_at)
 * on existing rows, so "Total sales" reconciles with Shopify.
 *
 * Lean by design — it issues a single UPDATE per order keyed on shopify_id and
 * does NOT re-run customer/line-item/attribution sync (which would re-emit
 * PostHog events for historical orders). Idempotent; safe to re-run.
 *
 * Usage (prod): pull prod env, then
 *   dotenv -e .env.production.local -- node --import tsx/esm scripts/backfill-order-money.ts [days]
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { order } from "@/lib/schema";
import { getShopifyClient, toCents } from "@/lib/shopify/client";
import { sumRefundedCents } from "@/lib/shopify/sync";
import type { ShopifyOrder } from "@/types/shopify";

const days = Number(process.argv[2] ?? "250");
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const shopify = getShopifyClient();
const endpoint = `/orders.json?limit=250&status=any&updated_at_min=${since.toISOString()}`;

let scanned = 0;
let updated = 0;
let notFound = 0;
let withRefunds = 0;
let page = 0;

console.log(`Backfilling order money fields since ${since.toISOString()} (${days}d)...`);

for await (const batch of shopify.fetchAll<ShopifyOrder>(endpoint, "orders")) {
  page++;
  for (const o of batch) {
    scanned++;
    const refunded = sumRefundedCents(o);
    if (refunded > 0) withRefunds++;
    const rows = await db
      .update(order)
      .set({
        totalTax: toCents(o.total_tax),
        totalDiscounts: toCents(o.total_discounts),
        totalShipping: toCents(
          o.total_shipping_price_set?.shop_money?.amount ?? "0",
        ),
        totalRefunded: refunded,
        cancelledAt: o.cancelled_at ? new Date(o.cancelled_at) : null,
      })
      .where(eq(order.shopifyId, String(o.id)))
      .returning({ id: order.id });
    if (rows.length > 0) updated++;
    else notFound++;
  }
  console.log(
    `  page ${page}: scanned=${scanned} updated=${updated} notFound=${notFound} withRefunds=${withRefunds}`,
  );
}

console.log(
  `\nDone. scanned=${scanned} updated=${updated} notFound=${notFound} withRefunds=${withRefunds}`,
);
process.exit(0);
