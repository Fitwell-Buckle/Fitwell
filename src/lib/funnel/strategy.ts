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
import { customer, order, ga4Daily, metaAdsDaily } from "@/lib/schema";
import { and, gte, lte, sql, sum, count, eq, isNull, or } from "drizzle-orm";
import {
  CHANNEL_LABELS,
  RETENTION_STAGE_META,
  type Channel,
  type Confidence,
  type RetentionStage,
  classifyRetentionStage,
  formatCents,
  mapToChannel,
} from "./classify";

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
  const [metaImpr, metaClicks, ga4Sessions, ga4Direct, orderTotals] =
    await Promise.all([
      db
        .select({
          impressions: sum(metaAdsDaily.impressions).mapWith(Number),
          reach: sum(metaAdsDaily.reach).mapWith(Number),
        })
        .from(metaAdsDaily)
        .where(and(gte(metaAdsDaily.date, from), lte(metaAdsDaily.date, to))),

      db
        .select({ clicks: sum(metaAdsDaily.clicks).mapWith(Number) })
        .from(metaAdsDaily)
        .where(and(gte(metaAdsDaily.date, from), lte(metaAdsDaily.date, to))),

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

      db
        .select({
          orders: count(),
          revenue: sum(order.totalPrice).mapWith(Number),
        })
        .from(order)
        .where(and(gte(order.processedAt, from), lte(order.processedAt, to))),
    ]);

  const stages: FunnelStageRow[] = [
    {
      stage: "unaware",
      value: metaImpr[0]?.impressions ?? 0,
      format: "count",
      source: "metaAdsDaily.impressions (cold + retargeting mixed)",
      confidence: "medium",
      note: "Total Meta paid impressions in window. Cold-vs-retargeting split requires campaign-name parsing (v2).",
    },
    {
      stage: "problem_aware",
      value: metaClicks[0]?.clicks ?? 0,
      format: "count",
      source: "metaAdsDaily.clicks",
      confidence: "weak",
      note: "Meta paid clicks as a coarse proxy. True problem_aware count requires PostHog video_progress / section_dwelled on the problem section.",
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
      value: 0,
      format: "count",
      source: "(none — needs PostHog cart_item_added / checkout_started)",
      confidence: "missing",
      note: "Not measurable until storefront pixel ships (see specs/work-plans/todo/posthog-integration.md Phase 1).",
    },
    {
      stage: "converting",
      value: orderTotals[0]?.orders ?? 0,
      format: "count",
      source: "order table",
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
  const rows = await db
    .select({
      orderCount: customer.orderCount,
      totalSpent: customer.totalSpent,
      totalQty: sql<number>`COALESCE((
        SELECT SUM(oli.quantity)::int
        FROM "order" o
        JOIN order_line_item oli ON oli.order_id = o.id
        WHERE o.customer_id = ${customer.id}
      ), 0)`.mapWith(Number),
    })
    .from(customer)
    .where(sql`${customer.orderCount} > 0`);

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
          : "customer.order_count + customer.total_spent + order_line_item.quantity",
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
  const rows = await db
    .select({
      utmSource: customer.utmSource,
      utmMedium: customer.utmMedium,
      utmCampaign: customer.utmCampaign,
      orderCount: customer.orderCount,
      totalSpent: customer.totalSpent,
    })
    .from(customer)
    .where(sql`${customer.orderCount} > 0`);

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
