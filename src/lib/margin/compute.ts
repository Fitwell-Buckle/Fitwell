/**
 * Pure (DB-free) contribution-margin rollup. The DB loader lives in
 * `./true-margin.ts`; this file holds the testable math, mirroring the
 * cogs compute.ts / cogs.ts split.
 *
 *   contribution = product revenue − COGS − carrier shipping cost − refunds
 *
 * See `./true-margin.ts` for the full definition and caveats.
 */
import { ORDER_CHANNELS, type OrderChannel } from "@/lib/orders/channel";

export interface ChannelMargin {
  channel: OrderChannel;
  orders: number;
  revenueCents: number;
  cogsCents: number;
  /** Revenue from SKUs that have no PO cost basis (excluded from COGS). */
  uncostedRevenueCents: number;
  shippingCostCents: number;
  refundsCents: number;
  /** revenue − cogs − shipping − refunds. */
  contributionCents: number;
  /** contribution / revenue, %. Null when revenue is 0. */
  marginPct: number | null;
}

export interface MarginRollupInputs {
  orders: { id: string; channel: OrderChannel; refundCents: number }[];
  lineItems: {
    orderId: string;
    sku: string | null;
    quantity: number;
    priceCents: number;
  }[];
  /** order id → carrier shipping cost (cents). */
  shippingByOrder: Map<string, number>;
  /** sku → avg unit cost (cents). */
  costBySku: Map<string, number>;
}

function emptyMargin(channel: OrderChannel): ChannelMargin {
  return {
    channel,
    orders: 0,
    revenueCents: 0,
    cogsCents: 0,
    uncostedRevenueCents: 0,
    shippingCostCents: 0,
    refundsCents: 0,
    contributionCents: 0,
    marginPct: null,
  };
}

/**
 * Aggregate per-order inputs into per-channel contribution margin. Order-grain
 * so shipping and refunds (per order) and revenue/COGS (per line) land in the
 * same channel bucket consistently.
 */
export function rollUpMarginByChannel(inp: MarginRollupInputs): ChannelMargin[] {
  const channelOf = new Map<string, OrderChannel>();
  const acc = new Map<OrderChannel, ChannelMargin>();
  const ensure = (c: OrderChannel) => {
    let m = acc.get(c);
    if (!m) {
      m = emptyMargin(c);
      acc.set(c, m);
    }
    return m;
  };

  for (const o of inp.orders) {
    channelOf.set(o.id, o.channel);
    const m = ensure(o.channel);
    m.orders += 1;
    m.refundsCents += o.refundCents;
    m.shippingCostCents += inp.shippingByOrder.get(o.id) ?? 0;
  }

  for (const li of inp.lineItems) {
    const ch = channelOf.get(li.orderId);
    if (!ch) continue; // line item for an out-of-scope order
    const m = ensure(ch);
    const rev = li.priceCents * li.quantity;
    m.revenueCents += rev;
    const cost = li.sku ? inp.costBySku.get(li.sku) : undefined;
    if (cost != null) m.cogsCents += Math.round(cost * li.quantity);
    else m.uncostedRevenueCents += rev;
  }

  for (const m of acc.values()) {
    m.contributionCents =
      m.revenueCents - m.cogsCents - m.shippingCostCents - m.refundsCents;
    m.marginPct =
      m.revenueCents > 0 ? (m.contributionCents / m.revenueCents) * 100 : null;
  }

  // Stable display order.
  return ORDER_CHANNELS.filter((c) => acc.has(c)).map((c) => acc.get(c)!);
}
