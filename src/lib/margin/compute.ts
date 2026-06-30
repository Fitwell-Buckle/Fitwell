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

/**
 * Minimum share of a channel's revenue that must carry a cost basis before we'll
 * show its margin %. Below this, the missing COGS would overstate margin (and
 * could misrank channels), so we withhold. Set at 0.90 because ~7% of B2B
 * revenue is SKU-less custom-money lines (tooling, deposits) with no product
 * cost; coverage is shown alongside so partial coverage stays visible.
 */
export const MARGIN_COVERAGE_THRESHOLD = 0.9;

export interface ChannelMargin {
  channel: OrderChannel;
  orders: number;
  /** Net product revenue (order subtotal, after discounts — NOT retail line price). */
  revenueCents: number;
  cogsCents: number;
  /** Revenue from orders that have a product cost basis. */
  costedRevenueCents: number;
  /** Revenue from orders with no product cost basis (excluded from COGS). */
  uncostedRevenueCents: number;
  shippingCostCents: number;
  refundsCents: number;
  /** revenue − cogs − shipping − refunds. Only meaningful once COGS is costed. */
  contributionCents: number;
  /**
   * contribution / revenue, %. Null unless COGS coverage clears
   * MARGIN_COVERAGE_THRESHOLD — a thinly-costed channel has no trustworthy
   * margin (missing product cost only lowers it), so we withhold rather than
   * mislead. `costedRevenueCents / revenueCents` is the coverage.
   */
  marginPct: number | null;
}

/**
 * One order's already-computed economics. Revenue is the NET subtotal (the
 * loader must not use retail line prices — wholesale discounts live at the order
 * level). COGS and `costed` are derived from the order's line items + cost map.
 */
export interface MarginOrderInput {
  channel: OrderChannel;
  revenueCents: number;
  cogsCents: number;
  /** True when we have a product cost basis for this order (≥1 costed unit). */
  costed: boolean;
  shippingCents: number;
  refundCents: number;
}

export interface MarginRollupInputs {
  orders: MarginOrderInput[];
}

function emptyMargin(channel: OrderChannel): ChannelMargin {
  return {
    channel,
    orders: 0,
    revenueCents: 0,
    cogsCents: 0,
    costedRevenueCents: 0,
    uncostedRevenueCents: 0,
    shippingCostCents: 0,
    refundsCents: 0,
    contributionCents: 0,
    marginPct: null,
  };
}

/**
 * Aggregate per-order economics into per-channel contribution margin.
 */
export function rollUpMarginByChannel(inp: MarginRollupInputs): ChannelMargin[] {
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
    const m = ensure(o.channel);
    m.orders += 1;
    m.revenueCents += o.revenueCents;
    m.cogsCents += o.cogsCents;
    m.shippingCostCents += o.shippingCents;
    m.refundsCents += o.refundCents;
    if (o.costed) m.costedRevenueCents += o.revenueCents;
    else m.uncostedRevenueCents += o.revenueCents;
  }

  for (const m of acc.values()) {
    m.contributionCents =
      m.revenueCents - m.cogsCents - m.shippingCostCents - m.refundsCents;
    const coverage =
      m.revenueCents > 0 ? m.costedRevenueCents / m.revenueCents : 0;
    m.marginPct =
      coverage >= MARGIN_COVERAGE_THRESHOLD
        ? (m.contributionCents / m.revenueCents) * 100
        : null;
  }

  return ORDER_CHANNELS.filter((c) => acc.has(c)).map((c) => acc.get(c)!);
}
