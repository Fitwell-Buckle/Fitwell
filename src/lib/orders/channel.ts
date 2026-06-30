/**
 * Canonical order-channel classification (D2C vs B2B vs Trade Show vs Sample).
 *
 * There is no B2B order tag or `order.company_id` — the signal we trust is
 * `order.source_name` (set verbatim from Shopify on sync). This mirrors the
 * dashboard's `segmentExpr` (src/app/(admin)/dashboard/page.tsx) but adds
 * `sample` as a first-class bucket: $0 sample/influencer-gift shipments
 * (`order.is_sample`) carry no revenue and ship outside normal economics, so
 * folding them into B2B or D2C distorts both — they get their own bucket.
 *
 * Why this matters: shipping economics differ enormously by channel (a single
 * B2B order can carry a $246 freight charge vs ~$5 D2C ground), so any
 * shipping-cost or margin figure must be reported per channel — never a blended
 * average masquerading as the D2C number.
 *
 * Use `classifyChannel()` for in-memory rows and `orderChannelSql` for grouping
 * in Drizzle queries; the two must stay in lockstep.
 */
import { sql } from "drizzle-orm";
import { order } from "@/lib/schema";

export type OrderChannel = "d2c" | "b2b" | "tradeshow" | "sample";

export const ORDER_CHANNELS: OrderChannel[] = ["d2c", "b2b", "tradeshow", "sample"];

export const ORDER_CHANNEL_LABELS: Record<OrderChannel, string> = {
  d2c: "D2C",
  b2b: "B2B / Wholesale",
  tradeshow: "Trade Show",
  sample: "Sample / Gift",
};

/**
 * Classify an order's channel from the signals we store. `sample` takes
 * precedence (a sample order can also carry `source_name='shopify_draft_order'`,
 * but a free sample is not a wholesale sale). Otherwise: draft order → b2b,
 * POS → tradeshow, everything else (web, NULL/legacy, other) → d2c.
 */
export function classifyChannel(
  sourceName: string | null | undefined,
  isSample: boolean,
): OrderChannel {
  if (isSample) return "sample";
  if (sourceName === "shopify_draft_order") return "b2b";
  if (sourceName === "pos") return "tradeshow";
  return "d2c";
}

/**
 * SQL form of `classifyChannel`, for SELECT + GROUP BY. Only column references
 * and literals (no bound params), so it's safe to reuse across both clauses —
 * same constraint the dashboard's segmentExpr relies on.
 */
export const orderChannelSql = sql<OrderChannel>`CASE
  WHEN ${order.isSample} = true THEN 'sample'
  WHEN ${order.sourceName} = 'shopify_draft_order' THEN 'b2b'
  WHEN ${order.sourceName} = 'pos' THEN 'tradeshow'
  ELSE 'd2c'
END`;
