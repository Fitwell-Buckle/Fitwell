/**
 * Data layer for /funnel/strategy — the strategic / diagnostic funnel
 * view aligned with specs/strategy/funnel.md (acquisition funnel),
 * specs/strategy/retention-loop.md (retention loop), and
 * specs/strategy/personas.md (channel-LTV).
 *
 * Honest scope: only uses data sources already feeding the app.
 * PostHog client-side events, Klaviyo API, and Judge.me API are
 * not wired yet, so the stages that depend on them surface with
 * explicit "needs instrumentation" markers in the page.
 *
 * Pure classification / mapping logic lives in ./classify.ts so it
 * can be tested without a DATABASE_URL.
 */
import { db } from "@/lib/db";
import {
  customer,
  order,
  orderLineItem,
  ga4Daily,
  metaAdsDaily,
} from "@/lib/schema";
import {
  and,
  gte,
  lte,
  sql,
  sum,
  count,
  eq,
  ne,
  isNull,
  isNotNull,
  or,
} from "drizzle-orm";
import {
  CHANNEL_LABELS,
  RETENTION_STAGE_META,
  type Channel,
  type Confidence,
  type RetentionStage,
  classifyRetentionStage,
  formatCents,
  mapMetaCampaign,
  mapToChannel,
} from "./classify";

/**
 * D2C-only order filter. Excludes wholesale / draft orders so the
 * strategy funnel matches the D2C scope in specs/strategy/funnel.md.
 * NULL sourceName is treated as D2C (orders predating sourceName
 * capture are mostly D2C web orders).
 */
const D2C_ONLY = or(
  isNull(order.sourceName),
  ne(order.sourceName, "shopify_draft_order"),
);

export {
  CHANNEL_LABELS,
  RETENTION_STAGE_META,
  classifyRetentionStage,
  confidenceLabel,
  formatCents,
  formatCount,
  mapToChannel,
} from "./classify";
export type {
  Channel,
  Confidence,
  RetentionStage,
} from "./classify";

// ─── Acquisition funnel ─────────────────────────────────────────────

export interface FunnelStageRow {
  stage: string;
  value: number;
  format: "count" | "currency_cents";
  source: string;
  confidence: Confidence;
  note?: string;
}

export interface AcquisitionFunnel {
  range: { from: Date; to: Date };
  stages: FunnelStageRow[];
}

export async function getAcquisitionFunnel(
  from: Date,
  to: Date,
): Promise<AcquisitionFunnel> {
  const [metaByCampaign, ga4Sessions, ga4Direct, orderTotals] =
    await Promise.all([
      // Per-campaign Meta rollup so we can split cold vs. retargeting
      db
        .select({
          campaignName: metaAdsDaily.campaignName,
          impressions: sum(metaAdsDaily.impressions).mapWith(Number),
          clicks: sum(metaAdsDaily.clicks).mapWith(Number),
        })
        .from(metaAdsDaily)
        .where(and(gte(metaAdsDaily.date, from), lte(metaAdsDaily.date, to)))
        .groupBy(metaAdsDaily.campaignName),

      db
        .select({
          sessions: sum(ga4Daily.sessions).mapWith(Number),
        })
        .from(ga4Daily)
        .where(
          and(
            gte(ga4Daily.date, from),
            lte(ga4Daily.date, to),
            eq(ga4Daily.medium, "organic"),
          ),
        ),

      db
        .select({
          sessions: sum(ga4Daily.sessions).mapWith(Number),
        })
        .from(ga4Daily)
        .where(
          and(
            gte(ga4Daily.date, from),
            lte(ga4Daily.date, to),
            or(eq(ga4Daily.source, "(direct)"), isNull(ga4Daily.source)),
          ),
        ),

      // D2C orders only — exclude wholesale / draft orders
      db
        .select({
          orders: count(),
          revenue: sum(order.totalPrice).mapWith(Number),
        })
        .from(order)
        .where(
          and(
            gte(order.processedAt, from),
            lte(order.processedAt, to),
            D2C_ONLY,
          ),
        ),
    ]);

  // Split Meta impressions/clicks per campaign-name heuristic.
  // mapMetaCampaign('Awareness — Cold — Watch Enthusiasts') = 'cold'
  // mapMetaCampaign('RT — Engagers 30d') = 'retargeting'
  let coldImpr = 0;
  let coldClicks = 0;
  let retargImpr = 0;
  for (const row of metaByCampaign) {
    const kind = mapMetaCampaign(row.campaignName);
    const impr = row.impressions ?? 0;
    const clicks = row.clicks ?? 0;
    if (kind === "retargeting") {
      retargImpr += impr;
    } else {
      // 'cold' and 'unknown' both bucket as cold (most non-explicit campaigns
      // are awareness/cold; revisit if a per-campaign override table arrives).
      coldImpr += impr;
      coldClicks += clicks;
    }
  }

  const stages: FunnelStageRow[] = [
    {
      stage: "unaware",
      value: coldImpr,
      format: "count",
      source: "metaAdsDaily.impressions (cold campaigns only)",
      confidence: "medium",
      note: "Meta cold/awareness impressions per mapMetaCampaign(). Retargeting moved to `considering`. Unrecognized campaign names default to cold; refine via a per-campaign override table if needed.",
    },
    {
      stage: "problem_aware",
      value: coldClicks,
      format: "count",
      source: "metaAdsDaily.clicks (cold campaigns only)",
      confidence: "weak",
      note: "Cold-campaign clicks as a coarse proxy. True problem_aware count requires PostHog video_progress / section_dwelled on the problem section.",
    },
    {
      stage: "solution_aware",
      value: ga4Sessions[0]?.sessions ?? 0,
      format: "count",
      source: "ga4Daily organic sessions (all queries)",
      confidence: "weak",
      note: "Organic-search sessions, no brand/non-brand split (GSC currently blocked on auth). Will narrow once GSC unblocks.",
    },
    {
      stage: "brand_aware",
      value: ga4Direct[0]?.sessions ?? 0,
      format: "count",
      source: "ga4Daily direct sessions",
      confidence: "medium",
      note: "Direct traffic as a proxy. Branded-search clicks (GSC) would sharpen this.",
    },
    {
      stage: "considering",
      value: retargImpr,
      format: "count",
      source: "metaAdsDaily.impressions (retargeting campaigns only)",
      confidence: "weak",
      note: "Meta retargeting impressions as a proxy for considering-stage exposure (lagging indicator of audience size). True considering count requires PostHog cart_item_added / checkout_started events.",
    },
    {
      stage: "converting",
      value: orderTotals[0]?.orders ?? 0,
      format: "count",
      source: "order table (D2C only — wholesale/draft excluded)",
      confidence: "strong",
      note: `${formatCents(orderTotals[0]?.revenue ?? 0)} revenue in window.`,
    },
  ];

  return { range: { from, to }, stages };
}

// ─── Retention loop ─────────────────────────────────────────────────

export interface RetentionStageRow {
  stage: RetentionStage;
  label: string;
  rule: string;
  customers: number;
  pctOfBase: number;
  totalSpendCents: number;
  avgSpendCents: number;
  source: string;
  confidence: Confidence;
  note?: string;
}

export interface RetentionLoop {
  totalCustomers: number;
  stages: RetentionStageRow[];
}

// Snapshot from scripts/persona-reviews-join.ts on 2026-05-26.
// Update when Judge.me API integration lands.
const STATIC_ADVOCATE_COUNT = 9;

export async function getRetentionLoop(): Promise<RetentionLoop> {
  // Compute per-customer rollups directly from the order table (D2C only),
  // not from customer.orderCount / customer.totalSpent which are denormalized
  // and known to drift (per personas.md Distribution finding). Two parallel
  // queries — orders for count + spend, line items for total units — joined
  // by customerId in TypeScript. Cleaner than a single grouped JOIN where the
  // line-item fan-out would inflate SUM(totalPrice).
  const [orderSummary, qtySummary] = await Promise.all([
    db
      .select({
        customerId: order.customerId,
        orderCount: count().mapWith(Number),
        totalSpent: sum(order.totalPrice).mapWith(Number),
      })
      .from(order)
      .where(and(isNotNull(order.customerId), D2C_ONLY))
      .groupBy(order.customerId),

    db
      .select({
        customerId: order.customerId,
        totalQty: sum(orderLineItem.quantity).mapWith(Number),
      })
      .from(order)
      .innerJoin(orderLineItem, eq(orderLineItem.orderId, order.id))
      .where(and(isNotNull(order.customerId), D2C_ONLY))
      .groupBy(order.customerId),
  ]);

  const qtyByCustomer = new Map<string, number>();
  for (const q of qtySummary) {
    if (q.customerId) qtyByCustomer.set(q.customerId, q.totalQty ?? 0);
  }
  const rows = orderSummary
    .filter((r) => r.customerId !== null)
    .map((r) => ({
      orderCount: r.orderCount,
      totalSpent: r.totalSpent ?? 0,
      totalQty: qtyByCustomer.get(r.customerId!) ?? 0,
    }));

  const acc: Record<
    RetentionStage,
    { customers: number; totalSpendCents: number }
  > = {
    first_buyer: { customers: 0, totalSpendCents: 0 },
    second_buyer: { customers: 0, totalSpendCents: 0 },
    multi_unit: { customers: 0, totalSpendCents: 0 },
    outfitter: { customers: 0, totalSpendCents: 0 },
    advocate: { customers: 0, totalSpendCents: 0 },
  };

  for (const r of rows) {
    const stage = classifyRetentionStage(r.orderCount ?? 0, r.totalQty ?? 0);
    if (!stage) continue;
    acc[stage].customers += 1;
    acc[stage].totalSpendCents += r.totalSpent ?? 0;
  }

  const totalCustomers = rows.length;

  const stageOrder: RetentionStage[] = [
    "first_buyer",
    "second_buyer",
    "multi_unit",
    "outfitter",
    "advocate",
  ];

  const stages: RetentionStageRow[] = stageOrder.map((stage) => {
    const meta = RETENTION_STAGE_META[stage];
    const customers =
      stage === "advocate" ? STATIC_ADVOCATE_COUNT : acc[stage].customers;
    const totalSpendCents = acc[stage].totalSpendCents;
    return {
      stage,
      label: meta.label,
      rule: meta.rule,
      customers,
      pctOfBase:
        totalCustomers > 0 ? (100 * customers) / totalCustomers : 0,
      totalSpendCents,
      avgSpendCents:
        customers > 0 && stage !== "advocate"
          ? Math.round(totalSpendCents / customers)
          : 0,
      source:
        stage === "advocate"
          ? "Static cross-reference (Judge.me export 2026-05-26)"
          : "order + order_line_item (D2C only, computed from orders not denormalized customer fields)",
      confidence: stage === "advocate" ? "weak" : "strong",
      note:
        stage === "advocate"
          ? `v1 shows static count from 2026-05-26 Judge.me cross-reference (${STATIC_ADVOCATE_COUNT} outfitter-reviewers). Live tracking requires Judge.me API integration.`
          : undefined,
    };
  });

  return { totalCustomers, stages };
}

// ─── Channel breakdown ──────────────────────────────────────────────

export interface ChannelRow {
  channel: Channel;
  label: string;
  customers: number;
  orders: number;
  totalSpendCents: number;
  avgLtvCents: number;
}

export async function getChannelBreakdown(): Promise<ChannelRow[]> {
  // Customer attribution (first-touch UTM) joined to their D2C order totals.
  // INNER JOIN ensures we only count customers with at least one D2C order;
  // wholesale-only customers (B2B) drop out per the funnel.md D2C scope.
  const rows = await db
    .select({
      utmSource: customer.utmSource,
      utmMedium: customer.utmMedium,
      utmCampaign: customer.utmCampaign,
      orderCount: count(order.id).mapWith(Number),
      totalSpent: sum(order.totalPrice).mapWith(Number),
    })
    .from(customer)
    .innerJoin(order, and(eq(order.customerId, customer.id), D2C_ONLY))
    .groupBy(
      customer.id,
      customer.utmSource,
      customer.utmMedium,
      customer.utmCampaign,
    );

  const acc = new Map<Channel, ChannelRow>();
  for (const r of rows) {
    const channel = mapToChannel({
      utmSource: r.utmSource,
      utmMedium: r.utmMedium,
      utmCampaign: r.utmCampaign,
    });
    const e =
      acc.get(channel) ??
      {
        channel,
        label: CHANNEL_LABELS[channel],
        customers: 0,
        orders: 0,
        totalSpendCents: 0,
        avgLtvCents: 0,
      };
    e.customers += 1;
    e.orders += r.orderCount ?? 0;
    e.totalSpendCents += r.totalSpent ?? 0;
    acc.set(channel, e);
  }

  const out = [...acc.values()].map((r) => ({
    ...r,
    avgLtvCents:
      r.customers > 0 ? Math.round(r.totalSpendCents / r.customers) : 0,
  }));
  out.sort((a, b) => b.totalSpendCents - a.totalSpendCents);
  return out;
}
