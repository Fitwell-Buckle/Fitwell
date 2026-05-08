import { db } from "@/lib/db";
import { posthogDaily, order } from "@/lib/schema";
import { sql, gte } from "drizzle-orm";

export interface FunnelStage {
  name: string;
  count: number;
  conversionRate: number;
}

export async function getFunnelData(): Promise<FunnelStage[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Get PostHog event counts for funnel stages
  const eventCounts = await db
    .select({
      eventName: posthogDaily.eventName,
      total: sql<number>`sum(${posthogDaily.uniqueUsers})::int`,
    })
    .from(posthogDaily)
    .where(gte(posthogDaily.date, thirtyDaysAgo))
    .groupBy(posthogDaily.eventName);

  // Get order count for last 30 days
  const orderCountResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(order)
    .where(gte(order.processedAt, thirtyDaysAgo));

  const eventMap = new Map(
    eventCounts.map((e) => [e.eventName, e.total ?? 0]),
  );
  const purchases = orderCountResult[0]?.count ?? 0;

  const pageviews = eventMap.get("$pageview") ?? 0;
  const productViews = eventMap.get("product_viewed") ?? 0;
  const addToCarts = eventMap.get("add_to_cart") ?? 0;
  const checkouts = eventMap.get("checkout_started") ?? 0;

  const stages: FunnelStage[] = [
    { name: "Page Views", count: pageviews, conversionRate: 100 },
    {
      name: "Product Views",
      count: productViews,
      conversionRate: pageviews > 0 ? (productViews / pageviews) * 100 : 0,
    },
    {
      name: "Add to Cart",
      count: addToCarts,
      conversionRate: productViews > 0 ? (addToCarts / productViews) * 100 : 0,
    },
    {
      name: "Checkout Started",
      count: checkouts,
      conversionRate: addToCarts > 0 ? (checkouts / addToCarts) * 100 : 0,
    },
    {
      name: "Purchase",
      count: purchases,
      conversionRate: checkouts > 0 ? (purchases / checkouts) * 100 : 0,
    },
  ];

  return stages;
}
