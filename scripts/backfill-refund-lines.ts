/**
 * One-off backfill: populate the order_refund_line table for existing orders.
 *
 * Refunds are embedded in the Shopify order payload, so no new endpoints are
 * needed — but the orders *list* endpoint can return a lighter refunds shape, so
 * for any order that actually carries a refund we fetch the full order detail
 * (getOrder) to capture the nested line_item product identity. Returned orders
 * are a small minority, so the extra per-order fetches are cheap.
 *
 * Idempotent: delete-and-replace refund rows per order, mirroring upsertOrder.
 * Does NOT touch customer/line-item/attribution sync (no PostHog re-emits).
 *
 * Usage (prod): pull prod env, then
 *   dotenv -e .env.production.local -- node --import tsx/esm scripts/backfill-refund-lines.ts [days]
 * Default window is wide (1000d) so a single run covers all history.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { order, orderRefundLine } from "@/lib/schema";
import { getShopifyClient } from "@/lib/shopify/client";
import { refundLineRows } from "@/lib/shopify/sync";
import type { ShopifyOrder } from "@/types/shopify";

const days = Number(process.argv[2] ?? "1000");
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const shopify = getShopifyClient();
const endpoint = `/orders.json?limit=250&status=any&updated_at_min=${since.toISOString()}`;

let scanned = 0;
let withRefunds = 0;
let ordersWritten = 0;
let rowsInserted = 0;
let notFound = 0;
let page = 0;

console.log(
  `Backfilling order_refund_line since ${since.toISOString()} (${days}d)...`,
);

for await (const batch of shopify.fetchAll<ShopifyOrder>(endpoint, "orders")) {
  page++;
  for (const listOrder of batch) {
    scanned++;
    if (!listOrder.refunds || listOrder.refunds.length === 0) continue;
    withRefunds++;

    // Resolve our internal order id; skip orders we don't have a row for.
    const [row] = await db
      .select({ id: order.id })
      .from(order)
      .where(eq(order.shopifyId, String(listOrder.id)))
      .limit(1);
    if (!row) {
      notFound++;
      continue;
    }

    // Fetch full detail for complete nested refund line_item product identity.
    const full = await shopify.getOrder(listOrder.id);
    const rows = refundLineRows(full, row.id);

    await db
      .delete(orderRefundLine)
      .where(eq(orderRefundLine.orderId, row.id));
    if (rows.length > 0) {
      await db.insert(orderRefundLine).values(rows);
      ordersWritten++;
      rowsInserted += rows.length;
    }
  }
  console.log(
    `  page ${page}: scanned=${scanned} withRefunds=${withRefunds} ordersWritten=${ordersWritten} rows=${rowsInserted} notFound=${notFound}`,
  );
}

console.log(
  `\nDone. scanned=${scanned} withRefunds=${withRefunds} ordersWritten=${ordersWritten} rowsInserted=${rowsInserted} notFound=${notFound}`,
);
process.exit(0);
