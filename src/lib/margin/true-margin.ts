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
 * - Revenue = order **subtotal** (net of discounts), NOT retail line prices.
 *   This matters enormously for B2B: wholesale/OEM orders carry retail line
 *   prices with the wholesale discount applied at the ORDER level, so summing
 *   line price × qty overstates B2B revenue ~2×. Subtotal excludes tax and
 *   shipping charged to the customer.
 * - COGS = unit cost × quantity per line (recognized PO cost, else standard
 *   cost). An order is "costed" if it has ≥1 costed unit; orders with no
 *   costable products (e.g. custom-money tooling/deposit lines) are uncosted
 *   and their revenue is tracked separately so coverage is visible.
 * - Shipping = what we PAID carriers (shipping_charge), not what we charged.
 * - Refunds = order.total_refunded (nets all refunds incl. any refunded
 *   shipping/tax — a slight over-subtraction vs pure product refunds).
 * - Excludes payment-processing fees and tax remittance. Samples excluded.
 */
import { db } from "@/lib/db";
import { order, orderLineItem, shippingCharge } from "@/lib/schema";
import { getCostBasisBySku } from "@/lib/cogs/cost-basis";
import { orderChannelSql } from "@/lib/orders/channel";
import { rollUpMarginByChannel, type ChannelMargin } from "./compute";
import { and, eq, gte, lte, sql } from "drizzle-orm";

export type { ChannelMargin, MarginRollupInputs } from "./compute";
export { rollUpMarginByChannel, MARGIN_COVERAGE_THRESHOLD } from "./compute";

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

  const [orderRows, lineItems, shipRows, costBasis] = await Promise.all([
    db
      .select({
        id: order.id,
        channel: orderChannelSql,
        // Net product revenue — subtotal, after discounts (wholesale discounts
        // live here, not in the line prices).
        revenueCents: sql<number>`coalesce(${order.subtotalPrice}, 0)`.mapWith(Number),
        refundCents: sql<number>`coalesce(${order.totalRefunded}, 0)`.mapWith(Number),
      })
      .from(order)
      .where(baseWhere),
    db
      .select({
        orderId: orderLineItem.orderId,
        sku: orderLineItem.sku,
        quantity: sql<number>`coalesce(${orderLineItem.quantity}, 0)`.mapWith(Number),
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
    getCostBasisBySku(),
  ]);

  const shippingByOrder = new Map<string, number>();
  for (const r of shipRows) if (r.orderId) shippingByOrder.set(r.orderId, r.cents);

  // Per-order COGS from line items: unit cost × quantity. An order is "costed"
  // when it has at least one costed unit (so custom-money / no-product orders
  // stay uncosted and don't fake a 100%-margin order).
  const cogsByOrder = new Map<string, number>();
  const costedOrders = new Set<string>();
  for (const li of lineItems) {
    if (li.quantity <= 0) continue;
    const cost = li.sku ? costBasis.get(li.sku)?.avgUnitCostCents : undefined;
    if (cost == null) continue;
    cogsByOrder.set(li.orderId, (cogsByOrder.get(li.orderId) ?? 0) + Math.round(cost * li.quantity));
    costedOrders.add(li.orderId);
  }

  const orders = orderRows.map((o) => ({
    channel: o.channel,
    revenueCents: o.revenueCents,
    cogsCents: cogsByOrder.get(o.id) ?? 0,
    costed: costedOrders.has(o.id),
    shippingCents: shippingByOrder.get(o.id) ?? 0,
    refundCents: o.refundCents,
  }));

  return rollUpMarginByChannel({ orders });
}
