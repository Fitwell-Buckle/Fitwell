/**
 * One-off backfill: populate the order shipping_* columns (city, province,
 * province_code, country, country_code) on existing rows from each order's
 * shipping_address. Enables geographic return analysis (return rate by country
 * / state) on historical orders.
 *
 * The shipping_address is included in the orders list payload, so this needs no
 * per-order fetch — one UPDATE per order keyed on shopify_id. Does NOT re-run
 * customer/line-item/attribution sync (no PostHog re-emits). Idempotent.
 *
 * Usage (prod): pull prod env, then
 *   node --env-file=.env.production.local --import tsx/esm scripts/backfill-order-shipping.ts [days]
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { order } from "@/lib/schema";
import { getShopifyClient } from "@/lib/shopify/client";
import { shippingFields } from "@/lib/shopify/sync";
import type { ShopifyOrder } from "@/types/shopify";

const days = Number(process.argv[2] ?? "1000");
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const shopify = getShopifyClient();
const endpoint = `/orders.json?limit=250&status=any&updated_at_min=${since.toISOString()}`;

let scanned = 0;
let updated = 0;
let withCountry = 0;
let notFound = 0;
let page = 0;

console.log(
  `Backfilling order shipping_* since ${since.toISOString()} (${days}d)...`,
);

for await (const batch of shopify.fetchAll<ShopifyOrder>(endpoint, "orders")) {
  page++;
  for (const o of batch) {
    scanned++;
    const fields = shippingFields(o);
    if (fields.shippingCountryCode) withCountry++;
    const rows = await db
      .update(order)
      .set(fields)
      .where(eq(order.shopifyId, String(o.id)))
      .returning({ id: order.id });
    if (rows.length > 0) updated++;
    else notFound++;
  }
  console.log(
    `  page ${page}: scanned=${scanned} updated=${updated} withCountry=${withCountry} notFound=${notFound}`,
  );
}

console.log(
  `\nDone. scanned=${scanned} updated=${updated} withCountry=${withCountry} notFound=${notFound}`,
);
process.exit(0);
