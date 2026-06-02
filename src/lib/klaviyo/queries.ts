/**
 * Read-side queries against the klaviyo_* tables. Surfaces what the
 * /funnel/strategy page widgets need: list growth, top campaigns, and
 * the welcome vs. post-purchase flow split.
 *
 * Empty-state safe: returns zero-rows / null fields when the cron
 * hasn't populated anything yet, so the page renders cleanly before
 * the first sync.
 */
import { db } from "@/lib/db";
import {
  klaviyoEmailPerformance,
  klaviyoFlowAttribution,
  klaviyoListGrowthDaily,
} from "@/lib/schema";
import { desc, isNull, and, gte } from "drizzle-orm";
import { classifyFlowName, type FlowBucket } from "./classify";

export { classifyFlowName };
export type { FlowBucket };

export interface KlaviyoListGrowthPoint {
  date: Date;
  subscribers: number | null;
  newSubscribers: number;
  unsubscribes: number;
}

export interface KlaviyoCampaignRow {
  campaignId: string;
  campaignName: string | null;
  sentAt: Date | null;
  sends: number;
  opens: number;
  clicks: number;
  conversions: number;
  revenueCents: number;
}

export interface KlaviyoFlowSplit {
  welcomeRevenueCents: number;
  welcomeOrders: number;
  postPurchaseRevenueCents: number;
  postPurchaseOrders: number;
  otherRevenueCents: number;
  otherOrders: number;
  totalRevenueCents: number;
  flows: Array<{
    flowId: string;
    flowName: string | null;
    bucket: "welcome" | "post_purchase" | "other";
    revenueCents: number;
    orders: number;
  }>;
}

export interface KlaviyoOverview {
  hasData: boolean;
  subscribersLatest: number | null;
  growth: KlaviyoListGrowthPoint[];
  growth30dNet: number;
  topCampaigns: KlaviyoCampaignRow[];
  flowSplit: KlaviyoFlowSplit;
}

export async function getKlaviyoOverview(): Promise<KlaviyoOverview> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

  const [growthRows, campaignRows, flowRows] = await Promise.all([
    db
      .select({
        date: klaviyoListGrowthDaily.date,
        subscribers: klaviyoListGrowthDaily.subscribers,
        newSubscribers: klaviyoListGrowthDaily.newSubscribers,
        unsubscribes: klaviyoListGrowthDaily.unsubscribes,
      })
      .from(klaviyoListGrowthDaily)
      .where(gte(klaviyoListGrowthDaily.date, thirtyDaysAgo))
      .orderBy(klaviyoListGrowthDaily.date),

    db
      .select({
        campaignId: klaviyoEmailPerformance.campaignId,
        campaignName: klaviyoEmailPerformance.campaignName,
        sentAt: klaviyoEmailPerformance.sentAt,
        sends: klaviyoEmailPerformance.sends,
        opens: klaviyoEmailPerformance.opens,
        clicks: klaviyoEmailPerformance.clicks,
        conversions: klaviyoEmailPerformance.conversions,
        revenueCents: klaviyoEmailPerformance.revenueCents,
      })
      .from(klaviyoEmailPerformance)
      .orderBy(desc(klaviyoEmailPerformance.revenueCents))
      .limit(5),

    // Latest aggregate row per flow (most recent touched_at, with null
    // customer/order — that's the Phase 0 aggregate granularity).
    db
      .select({
        flowId: klaviyoFlowAttribution.flowId,
        flowName: klaviyoFlowAttribution.flowName,
        attributedRevenueCents: klaviyoFlowAttribution.attributedRevenueCents,
        attributedOrderCount: klaviyoFlowAttribution.attributedOrderCount,
        touchedAt: klaviyoFlowAttribution.touchedAt,
      })
      .from(klaviyoFlowAttribution)
      .where(
        and(
          isNull(klaviyoFlowAttribution.customerId),
          isNull(klaviyoFlowAttribution.orderId),
        ),
      )
      .orderBy(desc(klaviyoFlowAttribution.touchedAt)),
  ]);

  // Dedup flow rows: keep the newest snapshot per flow_id.
  const latestByFlow = new Map<
    string,
    {
      flowId: string;
      flowName: string | null;
      revenueCents: number;
      orders: number;
    }
  >();
  for (const r of flowRows) {
    if (latestByFlow.has(r.flowId)) continue;
    latestByFlow.set(r.flowId, {
      flowId: r.flowId,
      flowName: r.flowName,
      revenueCents: r.attributedRevenueCents ?? 0,
      orders: r.attributedOrderCount ?? 0,
    });
  }

  const flows = [...latestByFlow.values()].map((f) => ({
    ...f,
    bucket: classifyFlowName(f.flowName),
  }));

  const flowSplit: KlaviyoFlowSplit = {
    welcomeRevenueCents: 0,
    welcomeOrders: 0,
    postPurchaseRevenueCents: 0,
    postPurchaseOrders: 0,
    otherRevenueCents: 0,
    otherOrders: 0,
    totalRevenueCents: 0,
    flows,
  };
  for (const f of flows) {
    flowSplit.totalRevenueCents += f.revenueCents;
    if (f.bucket === "welcome") {
      flowSplit.welcomeRevenueCents += f.revenueCents;
      flowSplit.welcomeOrders += f.orders;
    } else if (f.bucket === "post_purchase") {
      flowSplit.postPurchaseRevenueCents += f.revenueCents;
      flowSplit.postPurchaseOrders += f.orders;
    } else {
      flowSplit.otherRevenueCents += f.revenueCents;
      flowSplit.otherOrders += f.orders;
    }
  }

  const growth: KlaviyoListGrowthPoint[] = growthRows.map((r) => ({
    date: r.date,
    subscribers: r.subscribers,
    newSubscribers: r.newSubscribers ?? 0,
    unsubscribes: r.unsubscribes ?? 0,
  }));

  const subscribersLatest =
    [...growth].reverse().find((r) => r.subscribers !== null)?.subscribers ??
    null;

  const growth30dNet = growth.reduce(
    (acc, r) => acc + r.newSubscribers - r.unsubscribes,
    0,
  );

  return {
    hasData:
      growth.length > 0 || campaignRows.length > 0 || flows.length > 0,
    subscribersLatest,
    growth,
    growth30dNet,
    topCampaigns: campaignRows.map((r) => ({
      campaignId: r.campaignId,
      campaignName: r.campaignName,
      sentAt: r.sentAt,
      sends: r.sends ?? 0,
      opens: r.opens ?? 0,
      clicks: r.clicks ?? 0,
      conversions: r.conversions ?? 0,
      revenueCents: r.revenueCents ?? 0,
    })),
    flowSplit,
  };
}
