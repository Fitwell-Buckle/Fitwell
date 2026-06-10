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
  review,
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
  aggregateFirstOrderDiscountSplit,
  type FirstOrderDiscountSplit,
} from "@/lib/discount-codes";
import {
  CHANNEL_LABELS,
  RETENTION_STAGE_META,
  type Channel,
  type ChannelAggregate,
  type Confidence,
  type OrderPosition,
  type RetentionStage,
  type SegmentMix,
  aggregateChannelsFromCustomers,
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
  ChannelAggregate,
  Confidence,
  OrderPosition,
  RetentionStage,
  SegmentMix,
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

export async function getRetentionLoop(): Promise<RetentionLoop> {
  // Compute per-customer rollups directly from the order table (D2C only),
  // not from customer.orderCount / customer.totalSpent which are denormalized
  // and known to drift (per personas.md Distribution finding). Three parallel
  // queries — orders for count + spend (joined to customer for email so we
  // can detect advocates), line items for total units, reviewer-email set
  // for advocate detection.
  const [orderSummary, qtySummary, reviewerEmailRows] = await Promise.all([
    db
      .select({
        customerId: order.customerId,
        email: customer.email,
        orderCount: count().mapWith(Number),
        totalSpent: sum(order.totalPrice).mapWith(Number),
      })
      .from(order)
      .innerJoin(customer, eq(customer.id, order.customerId))
      .where(and(isNotNull(order.customerId), D2C_ONLY))
      .groupBy(order.customerId, customer.email),

    db
      .select({
        customerId: order.customerId,
        totalQty: sum(orderLineItem.quantity).mapWith(Number),
      })
      .from(order)
      .innerJoin(orderLineItem, eq(orderLineItem.orderId, order.id))
      .where(and(isNotNull(order.customerId), D2C_ONLY))
      .groupBy(order.customerId),

    // Deduped set of emails who have left at least one review of any source.
    // Drives the advocate-stage detection: a customer is an advocate iff
    // they're classified as outfitter AND their email matches a reviewer's.
    db
      .selectDistinct({ email: review.reviewerEmail })
      .from(review)
      .where(isNotNull(review.reviewerEmail)),
  ]);

  const qtyByCustomer = new Map<string, number>();
  for (const q of qtySummary) {
    if (q.customerId) qtyByCustomer.set(q.customerId, q.totalQty ?? 0);
  }
  const reviewerEmails = new Set<string>();
  for (const r of reviewerEmailRows) {
    if (r.email) reviewerEmails.add(r.email.toLowerCase().trim());
  }
  const rows = orderSummary
    .filter((r) => r.customerId !== null)
    .map((r) => ({
      orderCount: r.orderCount,
      totalSpent: r.totalSpent ?? 0,
      totalQty: qtyByCustomer.get(r.customerId!) ?? 0,
      email: r.email,
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

  // Advocate is computed orthogonally to the segment-mix classifier — a
  // customer is an advocate iff (a) they classify as outfitter, AND (b)
  // their email matches a reviewer's. We accumulate them separately so the
  // outfitter row keeps its full count (every outfitter contributes to the
  // outfitter bar) while the advocate row reflects only the subset who've
  // also publicly advocated.
  let advocateCount = 0;
  let advocateSpendCents = 0;
  for (const r of rows) {
    const stage = classifyRetentionStage(r.orderCount ?? 0, r.totalQty ?? 0);
    if (!stage) continue;
    acc[stage].customers += 1;
    acc[stage].totalSpendCents += r.totalSpent ?? 0;
    if (stage === "outfitter" && r.email) {
      const normalized = r.email.toLowerCase().trim();
      if (reviewerEmails.has(normalized)) {
        advocateCount += 1;
        advocateSpendCents += r.totalSpent ?? 0;
      }
    }
  }
  acc.advocate.customers = advocateCount;
  acc.advocate.totalSpendCents = advocateSpendCents;

  const totalCustomers = rows.length;
  const hasReviewData = reviewerEmails.size > 0;

  const stageOrder: RetentionStage[] = [
    "first_buyer",
    "second_buyer",
    "multi_unit",
    "outfitter",
    "advocate",
  ];

  const stages: RetentionStageRow[] = stageOrder.map((stage) => {
    const meta = RETENTION_STAGE_META[stage];
    const customers = acc[stage].customers;
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
        customers > 0 ? Math.round(totalSpendCents / customers) : 0,
      source:
        stage === "advocate"
          ? "order + customer + review (outfitter customers with a matched reviewer_email; Judge.me API extraction)"
          : "order + order_line_item (D2C only, computed from orders not denormalized customer fields)",
      confidence:
        stage === "advocate" && !hasReviewData ? "weak" : "strong",
      note:
        stage === "advocate" && !hasReviewData
          ? "No review data in the database yet — the extract-judgeme cron hasn't run successfully. Add JUDGEME_API_TOKEN + JUDGEME_SHOP_DOMAIN to Vercel prod env and trigger /api/cron/extract-judgeme."
          : undefined,
    };
  });

  return { totalCustomers, stages };
}

// ─── First-order discount split (360 W5 §6 — C1 measurement) ────────

export interface DiscountSplitResult {
  range: { from: Date; to: Date };
  split: FirstOrderDiscountSplit;
  /** Oldest order with a captured code — orders before this predate
   *  capture (codes ship with the 60-day backfill; full history lands
   *  with the Feb-2024 import). Null when no codes captured yet. */
  earliestCodeAt: Date | null;
}

/**
 * First D2C orders (sequence = 1 via ROW_NUMBER, same convention as
 * getChannelBreakdown) in the window, joined to their discount-code
 * redemptions. Family aggregation is pure
 * (aggregateFirstOrderDiscountSplit in @/lib/discount-codes); this is
 * just the DB-fetch wrapper. Samples and cancelled orders excluded.
 */
export async function getFirstOrderDiscountSplit(
  from: Date,
  to: Date,
): Promise<DiscountSplitResult> {
  const [codeRowsRes, earliestRes] = await Promise.all([
    db.execute<{
      order_id: string;
      code: string | null;
      amount_cents: number | null;
    }>(sql`
      WITH ranked AS (
        SELECT
          id,
          processed_at,
          ROW_NUMBER() OVER (
            PARTITION BY customer_id
            ORDER BY processed_at, id
          ) AS seq
        FROM "order"
        WHERE
          customer_id IS NOT NULL
          AND (source_name IS NULL OR source_name != 'shopify_draft_order')
          AND is_sample = false
          AND cancelled_at IS NULL
      )
      SELECT r.id AS order_id, dc.code, dc.amount_cents
      FROM ranked r
      LEFT JOIN order_discount_code dc ON dc.order_id = r.id
      WHERE r.seq = 1
        AND r.processed_at >= ${from.toISOString()}
        AND r.processed_at <= ${to.toISOString()}
    `),
    db.execute<{ earliest: string | null }>(sql`
      SELECT min(o.processed_at) AS earliest
      FROM order_discount_code dc
      JOIN "order" o ON o.id = dc.order_id
    `),
  ]);

  const codeRows = (
    (codeRowsRes as unknown as { rows?: unknown[] }).rows ??
    (codeRowsRes as unknown as unknown[])
  ) as Array<{
    order_id: string;
    code: string | null;
    amount_cents: number | null;
  }>;
  const earliestRows = (
    (earliestRes as unknown as { rows?: unknown[] }).rows ??
    (earliestRes as unknown as unknown[])
  ) as Array<{ earliest: string | null }>;

  const split = aggregateFirstOrderDiscountSplit(
    codeRows.map((r) => ({
      orderId: r.order_id,
      code: r.code,
      amountCents: r.amount_cents === null ? null : Number(r.amount_cents),
    })),
  );

  const earliest = earliestRows[0]?.earliest;
  return {
    range: { from, to },
    split,
    earliestCodeAt: earliest ? new Date(earliest) : null,
  };
}

// ─── Channel breakdown ──────────────────────────────────────────────

// ChannelRow is an alias for the pure ChannelAggregate type — kept so
// the page code reads naturally ("channel row") without coupling it to
// the helper's name.
export type ChannelRow = ChannelAggregate;

/**
 * Returns the per-channel breakdown with segment mix.
 *
 * When `segmentFilter` is set, only customers whose retention-loop
 * stage matches that filter are counted toward each channel's
 * totals — the segmentMix on each row will be zero in every other
 * stage.
 *
 * When `positionFilter` is set ('acquisition' or 'retention'), the
 * customer count + orders + revenue shown for each channel are
 * computed from the filtered subset of orders only — customer's
 * first D2C order chronologically (acquisition) or their second-
 * and-later orders (retention). Sequence is computed at query time
 * via ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY
 * processed_at) — no stored column, no drift risk. Segment
 * classification still uses the customer's lifetime order count
 * and unit count.
 *
 * Pure accumulation lives in `aggregateChannelsFromCustomers` in
 * classify.ts; this function is just the DB-fetch wrapper.
 */
export async function getChannelBreakdown(
  segmentFilter?: RetentionStage,
  positionFilter?: OrderPosition,
): Promise<ChannelRow[]> {
  // Two base queries (unchanged from before): per-customer lifetime
  // order count + spend + UTM, and per-customer total units. Both
  // filter to D2C orders only. Lifetime totals are what drive
  // retention-stage classification — never narrow them by position.
  const [orderRows, qtyRows] = await Promise.all([
    db
      .select({
        customerId: customer.id,
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
      ),

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
  for (const q of qtyRows) {
    if (q.customerId) qtyByCustomer.set(q.customerId, q.totalQty ?? 0);
  }

  // Third query, only when filtering by order position: per-customer
  // count + spend of orders matching the position filter (sequence = 1
  // for acquisition, sequence > 1 for retention). Computed via a
  // ROW_NUMBER window function in a CTE; no schema changes, always
  // consistent with the live order table.
  let positionMetricsByCustomer: Map<
    string,
    { displayedOrders: number; displayedSpentCents: number }
  > | null = null;

  if (positionFilter) {
    const seqWhere =
      positionFilter === "acquisition" ? sql`seq = 1` : sql`seq > 1`;
    const positionRows = await db.execute<{
      customer_id: string;
      order_count: number;
      total_spent: number;
    }>(sql`
      WITH ranked AS (
        SELECT
          customer_id,
          total_price,
          ROW_NUMBER() OVER (
            PARTITION BY customer_id
            ORDER BY processed_at, id
          ) AS seq
        FROM "order"
        WHERE
          customer_id IS NOT NULL
          AND (source_name IS NULL OR source_name != 'shopify_draft_order')
      )
      SELECT
        customer_id,
        COUNT(*)::int AS order_count,
        COALESCE(SUM(total_price), 0)::int AS total_spent
      FROM ranked
      WHERE ${seqWhere}
      GROUP BY customer_id
    `);
    const rows =
      (positionRows as unknown as { rows?: typeof positionRows }).rows ??
      (positionRows as unknown as typeof positionRows);
    positionMetricsByCustomer = new Map();
    for (const r of rows as unknown as Array<{
      customer_id: string;
      order_count: number;
      total_spent: number;
    }>) {
      positionMetricsByCustomer.set(r.customer_id, {
        displayedOrders: Number(r.order_count),
        displayedSpentCents: Number(r.total_spent),
      });
    }
  }

  return aggregateChannelsFromCustomers(
    orderRows
      .map((r) => {
        const positionMetrics =
          positionMetricsByCustomer?.get(r.customerId) ?? null;
        return {
          utmSource: r.utmSource,
          utmMedium: r.utmMedium,
          utmCampaign: r.utmCampaign,
          orderCount: r.orderCount,
          totalSpentCents: r.totalSpent ?? 0,
          totalQty: qtyByCustomer.get(r.customerId) ?? 0,
          // When positionFilter is active and the customer has at least
          // one matching order, show the filtered subset. If they have
          // no matching orders (e.g., a single-order customer under the
          // retention filter), drop them entirely below.
          displayedOrders: positionMetrics?.displayedOrders,
          displayedSpentCents: positionMetrics?.displayedSpentCents,
          _hasPositionMatch: positionMetrics !== null,
        };
      })
      // Drop customers with no orders matching the position filter so they
      // don't inflate the customer count on a slice that produced none of
      // their revenue.
      .filter((r) => !positionFilter || r._hasPositionMatch)
      .map(({ _hasPositionMatch: _, ...rest }) => rest),
    segmentFilter,
  );
}
