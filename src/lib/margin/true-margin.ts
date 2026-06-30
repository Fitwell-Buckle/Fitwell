/**
 * True (contribution) margin by channel:
 *
 *   contribution = product revenue − COGS − carrier shipping cost − refunds
 *
 * Computed at ORDER grain because the inputs live at different grains — COGS is
 * per-SKU, shipping is per-order — and reported PER CHANNEL because D2C and B2B
 * economics differ sharply (see src/lib/orders/channel.ts).
 *
 * Definitions / caveats (surface these wherever this is shown):
 * - Revenue = gross product line-item revenue (price × qty), matching getCogs.
 *   It does NOT include tax or shipping charged to the customer.
 * - COGS = recognized per-SKU PO cost. SKUs without a cost basis contribute no
 *   cost; their revenue is tracked as `uncostedRevenueCents` so coverage is
 *   visible (margin % on an uncosted-heavy channel reads high).
 * - Shipping = what we PAID carriers (shipping_charge), not what we charged.
 * - Refunds = order.total_refunded (nets all refunds incl. any refunded
 *   shipping/tax — a slight over-subtraction vs pure product refunds).
 * - Excludes payment-processing fees and tax remittance. Samples excluded
 *   (matching getCogs); cancelled orders are NOT excluded (also matching getCogs)
 *   so these figures reconcile with the COGS cards.
 */
import { db } from "@/lib/db";
import { order, orderLineItem, shippingCharge } from "@/lib/schema";
import { getAverageUnitCostBySku } from "@/lib/cogs/average-cost";
import { orderChannelSql } from "@/lib/orders/channel";
import { rollUpMarginByChannel, type ChannelMargin } from "./compute";
import { and, eq, gte, lte, sql } from "drizzle-orm";

export type { ChannelMargin, MarginRollupInputs } from "./compute";
export { rollUpMarginByChannel } from "./compute";

/**
 * Load contribution margin per channel over an order-date range. Same filters as
 * getCogs (samples excluded, bounded by processed_at) so totals reconcile.
 */
export async function getMarginByChannel(range: {
  from: Date;
  to: Date;
}): Promise<ChannelMargin[]> {
  const baseWhere = and(
    gte(order.processedAt, range.from),
    lte(order.processedAt, range.to),
    eq(order.isSample, false),
  );

  const [orders, lineItems, shipRows, costBySkuFull] = await Promise.all([
    db
      .select({
        id: order.id,
        channel: orderChannelSql,
        refundCents: sql<number>`coalesce(${order.totalRefunded}, 0)`.mapWith(Number),
      })
      .from(order)
      .where(baseWhere),
    db
      .select({
        orderId: orderLineItem.orderId,
        sku: orderLineItem.sku,
        quantity: sql<number>`coalesce(${orderLineItem.quantity}, 0)`.mapWith(Number),
        priceCents: sql<number>`coalesce(${orderLineItem.price}, 0)`.mapWith(Number),
      })
      .from(orderLineItem)
      .innerJoin(order, eq(order.id, orderLineItem.orderId))
      .where(baseWhere),
    // Shipping per in-scope order via join (avoids passing thousands of ids).
    db
      .select({
        orderId: shippingCharge.orderId,
        cents: sql<number>`sum(${shippingCharge.amountCents})`.mapWith(Number),
      })
      .from(shippingCharge)
      .innerJoin(order, eq(order.id, shippingCharge.orderId))
      .where(baseWhere)
      .groupBy(shippingCharge.orderId),
    getAverageUnitCostBySku(),
  ]);

  const shippingByOrder = new Map<string, number>();
  for (const r of shipRows) if (r.orderId) shippingByOrder.set(r.orderId, r.cents);

  const costBySku = new Map<string, number>();
  for (const [sku, c] of costBySkuFull) costBySku.set(sku, c.avgUnitCostCents);

  return rollUpMarginByChannel({ orders, lineItems, shippingByOrder, costBySku });
}
