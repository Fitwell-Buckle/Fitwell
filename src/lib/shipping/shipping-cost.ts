/**
 * Shipping cost (what we paid the carrier) aggregated from `shipping_charge`,
 * always split by order channel. Shipping economics differ wildly between D2C
 * and B2B, so a blended average is misleading — every figure here is per
 * channel. See `src/lib/orders/channel.ts`.
 *
 * Cost is per order (an order can have several charges — reships/split labels),
 * so we sum `amount_cents` per `order_id` FIRST, then join `order` to classify
 * and group. Summing in a subquery avoids fanning out the per-order total across
 * multiple charge rows.
 */
import { db } from "@/lib/db";
import { order, shippingCharge } from "@/lib/schema";
import { orderChannelSql, type OrderChannel } from "@/lib/orders/channel";
import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";

export interface ChannelShippingCost {
  channel: OrderChannel;
  /** Orders that have at least one matched shipping charge. */
  orders: number;
  totalCents: number;
  /** totalCents / orders — the per-channel average that's safe to quote. */
  avgCentsPerOrder: number;
}

export interface DateRange {
  from?: Date;
  to?: Date;
}

/**
 * Shipping cost per channel over an optional order-date range (bounded by
 * `order.processed_at`, to align with revenue/COGS reporting). Only charges
 * matched to an order are included; unmatched charges (`order_id IS NULL`) are
 * excluded since they can't be attributed to a channel.
 */
export async function getShippingCostByChannel(
  range: DateRange = {},
): Promise<ChannelShippingCost[]> {
  // Per-order shipping total — collapse multiple charges to one row per order.
  const perOrder = db
    .select({
      orderId: shippingCharge.orderId,
      cents: sql<number>`sum(${shippingCharge.amountCents})`.as("cents"),
    })
    .from(shippingCharge)
    .where(isNotNull(shippingCharge.orderId))
    .groupBy(shippingCharge.orderId)
    .as("per_order");

  const conds = [];
  if (range.from) conds.push(gte(order.processedAt, range.from));
  if (range.to) conds.push(lte(order.processedAt, range.to));

  const rows = await db
    .select({
      channel: orderChannelSql,
      orders: sql<number>`count(*)`.mapWith(Number),
      totalCents: sql<number>`coalesce(sum(${perOrder.cents}), 0)`.mapWith(Number),
    })
    .from(perOrder)
    .innerJoin(order, eq(order.id, perOrder.orderId))
    .where(conds.length ? and(...conds) : undefined)
    .groupBy(orderChannelSql);

  return rows.map((r) => ({
    channel: r.channel,
    orders: r.orders,
    totalCents: r.totalCents,
    avgCentsPerOrder: r.orders > 0 ? Math.round(r.totalCents / r.orders) : 0,
  }));
}

/**
 * Per-order shipping cost for a specific set of orders — for the orders list.
 * Returns a Map of order id → total cents (orders with no charge are absent).
 */
export async function getShippingCostByOrderIds(
  orderIds: string[],
): Promise<Map<string, number>> {
  if (orderIds.length === 0) return new Map();
  const rows = await db
    .select({
      orderId: shippingCharge.orderId,
      cents: sql<number>`sum(${shippingCharge.amountCents})`.mapWith(Number),
    })
    .from(shippingCharge)
    .where(inArray(shippingCharge.orderId, orderIds))
    .groupBy(shippingCharge.orderId);
  const map = new Map<string, number>();
  for (const r of rows) if (r.orderId) map.set(r.orderId, r.cents);
  return map;
}
