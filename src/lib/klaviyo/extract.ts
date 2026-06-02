/**
 * Klaviyo ETL — pulls campaign performance, flow aggregates, and list
 * growth into the three klaviyo_* tables. Called by /api/cron/extract-
 * klaviyo. Each function is idempotent (upsert or delete-then-insert)
 * so re-runs and backfills are safe.
 *
 * Phase 0 of specs/work-plans/todo/klaviyo-integration.md.
 */
import { db } from "@/lib/db";
import {
  klaviyoEmailPerformance,
  klaviyoFlowAttribution,
  klaviyoListGrowthDaily,
} from "@/lib/schema";
import {
  KlaviyoClient,
  type KlaviyoStatistic,
  type KlaviyoTimeframe,
} from "./client";
import { sql } from "drizzle-orm";

const PLACED_ORDER_METRIC_NAME = "Placed Order";
const SUBSCRIBED_TO_LIST_METRIC_NAME = "Subscribed to List";
const UNSUBSCRIBED_METRIC_NAME = "Unsubscribed";

const REPORT_STATISTICS: KlaviyoStatistic[] = [
  "recipients",
  "delivered",
  "opens_unique",
  "clicks_unique",
  "conversion_uniques",
  "conversion_value",
];

/**
 * Discover metric IDs by name. Klaviyo accounts can have custom metrics, so
 * we look them up rather than hard-coding IDs. The Placed Order metric is
 * Shopify-integration-installed; if it's not present, conversion reporting
 * is disabled (we'll surface that in the cron response).
 */
async function discoverMetricIds(client: KlaviyoClient): Promise<{
  placedOrder: string | null;
  subscribed: string | null;
  unsubscribed: string | null;
}> {
  const metrics = await client.listMetrics();
  const find = (name: string) =>
    metrics.find((m) => m.name === name)?.id ?? null;
  return {
    placedOrder: find(PLACED_ORDER_METRIC_NAME),
    subscribed: find(SUBSCRIBED_TO_LIST_METRIC_NAME),
    unsubscribed: find(UNSUBSCRIBED_METRIC_NAME),
  };
}

/**
 * Discover the newsletter list — prefers an explicit env var
 * (KLAVIYO_NEWSLETTER_LIST_ID) but falls back to the largest list by
 * profile count for first-run convenience. Logs a warning if multiple
 * candidate lists exist so the account-holder can be explicit.
 */
async function discoverNewsletterList(
  client: KlaviyoClient,
): Promise<{ id: string; name: string; profileCount: number | null } | null> {
  const explicit = process.env.KLAVIYO_NEWSLETTER_LIST_ID;
  const lists = await client.listLists();
  if (explicit) {
    const match = lists.find((l) => l.id === explicit);
    if (match) return match;
    console.warn(
      `KLAVIYO_NEWSLETTER_LIST_ID=${explicit} not found; falling back to largest list`,
    );
  }
  const ranked = lists
    .filter((l) => l.profileCount !== null)
    .sort((a, b) => (b.profileCount ?? 0) - (a.profileCount ?? 0));
  if (ranked.length > 1) {
    console.warn(
      `Multiple Klaviyo lists found (${ranked.length}); using "${ranked[0].name}". ` +
        `Set KLAVIYO_NEWSLETTER_LIST_ID to lock this in.`,
    );
  }
  return ranked[0] ?? lists[0] ?? null;
}

function pickStat(
  row: { statistics: Partial<Record<KlaviyoStatistic, number>> },
  stat: KlaviyoStatistic,
): number {
  return Math.round(row.statistics[stat] ?? 0);
}

/**
 * Pull per-campaign aggregates from `/campaign-values-reports` and upsert
 * into klaviyo_email_performance. One row per campaign; engagement keeps
 * accruing for weeks after send so the cron refreshes the same row rather
 * than appending a time series.
 */
export async function extractCampaignPerformance(
  client: KlaviyoClient,
  conversionMetricId: string,
  timeframe: KlaviyoTimeframe = { key: "last_90_days" },
): Promise<number> {
  const rows = await client.campaignValuesReport({
    conversionMetricId,
    statistics: REPORT_STATISTICS,
    timeframe,
  });
  if (rows.length === 0) return 0;

  // Enrich with campaign names + send time (values-report omits these).
  const ids = rows.map((r) => r.groupings.campaign_id);
  const meta = await client.getCampaigns(ids);

  for (const row of rows) {
    const campaignId = row.groupings.campaign_id;
    const m = meta.get(campaignId);
    const values = {
      campaignId,
      campaignName: m?.name ?? null,
      sentAt: m?.sendTime ?? null,
      sends: pickStat(row, "recipients") || pickStat(row, "delivered"),
      opens: pickStat(row, "opens_unique"),
      clicks: pickStat(row, "clicks_unique"),
      conversions: pickStat(row, "conversion_uniques"),
      revenueCents: Math.round((row.statistics.conversion_value ?? 0) * 100),
      capturedAt: new Date(),
    };
    await db
      .insert(klaviyoEmailPerformance)
      .values(values)
      .onConflictDoUpdate({
        target: klaviyoEmailPerformance.campaignId,
        set: {
          campaignName: values.campaignName,
          sentAt: values.sentAt,
          sends: values.sends,
          opens: values.opens,
          clicks: values.clicks,
          conversions: values.conversions,
          revenueCents: values.revenueCents,
          capturedAt: values.capturedAt,
        },
      });
  }
  return rows.length;
}

/**
 * Pull per-flow aggregates from `/flow-values-reports` and write AGGREGATE
 * rows to klaviyo_flow_attribution (customer_id + order_id NULL, one row
 * per flow per sync). Per-order grain is a Phase 0.5 follow-up — those
 * rows will have customer_id + order_id populated and won't collide with
 * the aggregates from this function.
 */
export async function extractFlowAggregates(
  client: KlaviyoClient,
  conversionMetricId: string,
  timeframe: KlaviyoTimeframe = { key: "last_90_days" },
): Promise<number> {
  const rows = await client.flowValuesReport({
    conversionMetricId,
    statistics: REPORT_STATISTICS,
    timeframe,
  });
  if (rows.length === 0) return 0;

  const ids = rows.map((r) => r.groupings.flow_id);
  const names = await client.getFlows(ids);
  const now = new Date();

  // Idempotent: drop today's aggregate rows for each flow, re-insert.
  // Per-order rows (customer_id NOT NULL) are untouched.
  await db.delete(klaviyoFlowAttribution).where(
    sql`${klaviyoFlowAttribution.customerId} IS NULL
        AND ${klaviyoFlowAttribution.orderId} IS NULL
        AND date_trunc('day', ${klaviyoFlowAttribution.touchedAt}) = date_trunc('day', ${now.toISOString()}::timestamp)`,
  );

  const values = rows.map((row) => ({
    flowId: row.groupings.flow_id,
    flowName: names.get(row.groupings.flow_id) ?? null,
    customerId: null,
    orderId: null,
    attributedRevenueCents: Math.round(
      (row.statistics.conversion_value ?? 0) * 100,
    ),
    attributedOrderCount: pickStat(row, "conversion_uniques"),
    touchedAt: now,
  }));
  if (values.length > 0) {
    await db.insert(klaviyoFlowAttribution).values(values);
  }
  return values.length;
}

/**
 * Pull daily subscribed/unsubscribed counts for the newsletter list from
 * `/metric-aggregates` and upsert into klaviyo_list_growth_daily. Total
 * subscribers (column `subscribers`) comes from the list's profile_count
 * snapshot — Klaviyo doesn't expose a daily history, so we record the
 * current snapshot on each sync date.
 */
export async function extractListGrowth(
  client: KlaviyoClient,
  metricIds: { subscribed: string | null; unsubscribed: string | null },
  days = 90,
): Promise<number> {
  const list = await discoverNewsletterList(client);
  if (!list) return 0;

  const end = new Date();
  end.setUTCHours(0, 0, 0, 0); // exclusive upper bound at today 00:00 UTC
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - days);

  const byDate = new Map<
    string,
    {
      date: Date;
      newSubscribers: number;
      unsubscribes: number;
    }
  >();

  async function pullCounts(
    metricId: string | null,
    key: "newSubscribers" | "unsubscribes",
  ) {
    if (!metricId) return;
    const points = await client.metricAggregate({
      metricId,
      measurements: ["count"],
      interval: "day",
      start,
      end,
    });
    for (const p of points) {
      const ymd = p.date.toISOString().split("T")[0];
      if (!byDate.has(ymd)) {
        byDate.set(ymd, {
          date: new Date(`${ymd}T00:00:00Z`),
          newSubscribers: 0,
          unsubscribes: 0,
        });
      }
      byDate.get(ymd)![key] = Math.round(p.count);
    }
  }

  await pullCounts(metricIds.subscribed, "newSubscribers");
  await pullCounts(metricIds.unsubscribed, "unsubscribes");

  // Snapshot current total subscribers onto today's row only — historical
  // dates record null (we don't have a Klaviyo-side time series).
  const todayYmd = end.toISOString().split("T")[0];

  for (const [ymd, row] of byDate) {
    const isToday = ymd === todayYmd;
    await db
      .insert(klaviyoListGrowthDaily)
      .values({
        date: row.date,
        listId: list.id,
        listName: list.name,
        subscribers: isToday ? list.profileCount : null,
        newSubscribers: row.newSubscribers,
        unsubscribes: row.unsubscribes,
      })
      .onConflictDoUpdate({
        target: [klaviyoListGrowthDaily.date, klaviyoListGrowthDaily.listId],
        set: {
          listName: list.name,
          subscribers: isToday ? list.profileCount : sql`subscribers`,
          newSubscribers: row.newSubscribers,
          unsubscribes: row.unsubscribes,
        },
      });
  }

  return byDate.size;
}

export interface KlaviyoExtractSummary {
  campaignRows: number;
  flowRows: number;
  listGrowthRows: number;
  metricsDiscovered: {
    placedOrder: string | null;
    subscribed: string | null;
    unsubscribed: string | null;
  };
}

/** End-to-end Phase 0 extract. Returns counts per table for cron logging. */
export async function extractKlaviyo(
  client = new KlaviyoClient(),
): Promise<KlaviyoExtractSummary> {
  const metricIds = await discoverMetricIds(client);

  let campaignRows = 0;
  let flowRows = 0;
  if (metricIds.placedOrder) {
    campaignRows = await extractCampaignPerformance(
      client,
      metricIds.placedOrder,
    );
    flowRows = await extractFlowAggregates(client, metricIds.placedOrder);
  } else {
    console.warn(
      `Klaviyo: "${PLACED_ORDER_METRIC_NAME}" metric not found — campaign/flow performance skipped`,
    );
  }

  const listGrowthRows = await extractListGrowth(client, {
    subscribed: metricIds.subscribed,
    unsubscribed: metricIds.unsubscribed,
  });

  return {
    campaignRows,
    flowRows,
    listGrowthRows,
    metricsDiscovered: metricIds,
  };
}
