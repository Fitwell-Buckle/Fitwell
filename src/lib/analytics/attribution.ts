import { db } from "@/lib/db";
import { customer, order, utmAttribution } from "@/lib/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";

export type Channel =
  | "organic_search"
  | "paid_search"
  | "social"
  | "email"
  | "direct"
  | "referral"
  | "other";

export function mapUtmToChannel(
  source: string | null,
  medium: string | null,
): Channel {
  const s = (source ?? "").toLowerCase();
  const m = (medium ?? "").toLowerCase();

  if (m === "cpc" || m === "ppc" || m === "paid") return "paid_search";
  if (m === "organic" || s === "google" || s === "bing") return "organic_search";
  if (m === "email" || s === "resend" || s === "mailchimp") return "email";
  if (
    m === "social" ||
    ["facebook", "instagram", "twitter", "tiktok", "youtube"].includes(s)
  )
    return "social";
  if (m === "referral") return "referral";
  if (!s && !m) return "direct";

  return "other";
}

export interface AttributionBreakdown {
  channel: Channel;
  visitors: number;
  percentage: number;
}

export async function calculateAttribution(): Promise<AttributionBreakdown[]> {
  const rows = await db
    .select({
      source: utmAttribution.source,
      medium: utmAttribution.medium,
      count: sql<number>`count(*)::int`,
    })
    .from(utmAttribution)
    .groupBy(utmAttribution.source, utmAttribution.medium);

  const channelMap = new Map<Channel, number>();

  for (const row of rows) {
    const channel = mapUtmToChannel(row.source, row.medium);
    channelMap.set(channel, (channelMap.get(channel) ?? 0) + row.count);
  }

  const total = Array.from(channelMap.values()).reduce((a, b) => a + b, 0);

  return Array.from(channelMap.entries())
    .map(([channel, visitors]) => ({
      channel,
      visitors,
      percentage: total > 0 ? Math.round((visitors / total) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.visitors - a.visitors);
}

export interface ChannelPerformance {
  channel: Channel;
  orders: number;
  revenue: number; // cents
}

/**
 * Orders + revenue grouped by the customer's first-touch channel.
 *
 * Resolves the order-vs-customer grain mismatch in the old UTM card: it
 * aggregates *orders* (with revenue) by the channel derived from the
 * customer's stored first-touch UTM, rather than counting customers.
 */
export async function getChannelPerformance(
  from: Date,
  to: Date,
): Promise<ChannelPerformance[]> {
  const rows = await db
    .select({
      source: customer.utmSource,
      medium: customer.utmMedium,
      orders: sql<number>`count(${order.id})::int`,
      revenue: sql<number>`coalesce(sum(${order.totalPrice}), 0)::int`,
    })
    .from(order)
    .leftJoin(customer, eq(order.customerId, customer.id))
    .where(and(gte(order.processedAt, from), lte(order.processedAt, to)))
    .groupBy(customer.utmSource, customer.utmMedium);

  const byChannel = new Map<Channel, { orders: number; revenue: number }>();
  for (const r of rows) {
    const ch = mapUtmToChannel(r.source, r.medium);
    const cur = byChannel.get(ch) ?? { orders: 0, revenue: 0 };
    cur.orders += r.orders;
    cur.revenue += r.revenue;
    byChannel.set(ch, cur);
  }

  return Array.from(byChannel.entries())
    .map(([channel, v]) => ({ channel, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
}

export interface PixelAttributedChannelRow {
  channel: Channel;
  orders: number;
  revenue: number; // cents
  medianTimeToConvertSeconds: number | null;
}

/**
 * Pixel-attributed channel performance: orders + revenue grouped by the
 * channel of the visitor's *true first-touch* utm_attribution row
 * (the row marked `converted=true` by linkOrderToAttribution at order time).
 *
 * Joins `order` → `utm_attribution` via `fw_distinct_id`, so only orders
 * with `link_method = 'pixel'` and a populated `fw_distinct_id` qualify.
 * Pre-pixel orders (everything before 2026-06-03) are implicitly excluded.
 *
 * Conceptual difference from getChannelPerformance: that helper joins to
 * `customer.utm_source`, which Shopify only sets from the *converting
 * visit*'s landing_site UTM — closer to last-touch at checkout than
 * first-touch of the visitor. This view uses the storefront snippet's
 * earliest-touch capture, gated by the first-touch `fw_attribution`
 * cookie — what visit *brought* the buyer, not what landed them on
 * checkout.
 *
 * Also returns median time-to-convert per channel (utm_attribution
 * captured_at → order processed_at). Null when no orders for a channel.
 */
export async function getPixelAttributedChannelPerformance(
  from: Date,
  to: Date,
): Promise<PixelAttributedChannelRow[]> {
  const rows = await db
    .select({
      source: utmAttribution.source,
      medium: utmAttribution.medium,
      orders: sql<number>`count(${order.id})::int`,
      revenue: sql<number>`coalesce(sum(${order.totalPrice}), 0)::int`,
      // Median time-to-convert via percentile_cont over (processed - captured).
      medianSeconds: sql<number | null>`
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM ${order.processedAt} - ${utmAttribution.capturedAt})
        )
      `,
    })
    .from(order)
    .innerJoin(
      utmAttribution,
      and(
        eq(utmAttribution.posthogDistinctId, order.posthogDistinctId),
        eq(utmAttribution.converted, true),
      ),
    )
    .where(
      and(
        gte(order.processedAt, from),
        lte(order.processedAt, to),
        eq(order.linkMethod, "pixel"),
      ),
    )
    .groupBy(utmAttribution.source, utmAttribution.medium);

  const byChannel = new Map<
    Channel,
    { orders: number; revenue: number; medianBuckets: number[] }
  >();
  for (const r of rows) {
    const ch = mapUtmToChannel(r.source, r.medium);
    const cur = byChannel.get(ch) ?? { orders: 0, revenue: 0, medianBuckets: [] };
    cur.orders += r.orders;
    cur.revenue += r.revenue;
    if (r.medianSeconds != null) cur.medianBuckets.push(Number(r.medianSeconds));
    byChannel.set(ch, cur);
  }

  return Array.from(byChannel.entries())
    .map(([channel, v]) => ({
      channel,
      orders: v.orders,
      revenue: v.revenue,
      medianTimeToConvertSeconds:
        v.medianBuckets.length > 0
          ? Math.round(
              v.medianBuckets.reduce((a, b) => a + b, 0) / v.medianBuckets.length,
            )
          : null,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export interface LinkConfidence {
  pixel: number;
  emailMatch: number;
  unattributed: number;
}

/** How orders in a window were linked to a pre-purchase touch (confidence). */
export async function getLinkConfidence(
  from: Date,
  to: Date,
): Promise<LinkConfidence> {
  const rows = await db
    .select({
      linkMethod: order.linkMethod,
      count: sql<number>`count(*)::int`,
    })
    .from(order)
    .where(and(gte(order.processedAt, from), lte(order.processedAt, to)))
    .groupBy(order.linkMethod);

  const out: LinkConfidence = { pixel: 0, emailMatch: 0, unattributed: 0 };
  for (const r of rows) {
    if (r.linkMethod === "pixel") out.pixel += r.count;
    else if (r.linkMethod === "email_match") out.emailMatch += r.count;
    else out.unattributed += r.count;
  }
  return out;
}
