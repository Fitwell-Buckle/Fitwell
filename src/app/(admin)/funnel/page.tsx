import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { order, customer, ga4Daily } from "@/lib/schema";
import { sql, gte, lte, and, count, sum } from "drizzle-orm";
import { parseDateRange } from "@/lib/date-range";
import {
  formatBucketLabel,
  dateToBucketKey,
  generateBucketKeys,
} from "@/lib/chart-utils";
import { ConversionTrendChart } from "@/components/charts/conversion-trend-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/charts/metric-card";
import { Mono } from "@/components/ui/data-table";
import { getFunnelData, getLandingPageBreakdown } from "@/lib/admin/funnel";

export const metadata: Metadata = {
  title: "Conversion Funnel | Fitwell Admin",
};

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function pct(a: number, b: number) {
  if (b === 0) return "—";
  return `${((a / b) * 100).toFixed(1)}%`;
}

export default async function FunnelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const { from, to, granularity } = parseDateRange(params);

  const [
    sessionData,
    orderData,
    customerData,
    webOrders,
    draftOrders,
    repeatCustomers,
    posthogStages,
    landingPages,
  ] = await Promise.all([
    db
      .select({
        sessions: sum(ga4Daily.sessions).mapWith(Number),
        users: sum(ga4Daily.users).mapWith(Number),
      })
      .from(ga4Daily)
      .where(and(gte(ga4Daily.date, from), lte(ga4Daily.date, to))),

    db
      .select({
        total: count(),
        revenue: sum(order.totalPrice).mapWith(Number),
      })
      .from(order)
      .where(and(gte(order.processedAt, from), lte(order.processedAt, to))),

    db
      .select({ total: count() })
      .from(customer)
      .where(and(gte(customer.createdAt, from), lte(customer.createdAt, to))),

    db
      .select({ total: count() })
      .from(order)
      .where(
        sql`${order.processedAt} >= ${from} AND ${order.processedAt} <= ${to} AND ${order.sourceName} = 'web'`,
      ),

    db
      .select({ total: count() })
      .from(order)
      .where(
        sql`${order.processedAt} >= ${from} AND ${order.processedAt} <= ${to} AND ${order.sourceName} = 'shopify_draft_order'`,
      ),

    db
      .select({ total: count() })
      .from(customer)
      .where(sql`${customer.orderCount} > 1`),

    getFunnelData(),
    getLandingPageBreakdown(),
  ]);

  const sessions = sessionData[0]?.sessions ?? 0;
  const users = sessionData[0]?.users ?? 0;
  const orders = orderData[0]?.total ?? 0;
  const revenue = orderData[0]?.revenue ?? 0;
  const newCustomers = customerData[0]?.total ?? 0;
  const webOrderCount = webOrders[0]?.total ?? 0;
  const draftOrderCount = draftOrders[0]?.total ?? 0;
  const repeatCount = repeatCustomers[0]?.total ?? 0;

  const stages = [
    { label: "Sessions (GA4)", value: sessions },
    { label: "Unique Users", value: users },
    { label: "Orders (Web)", value: webOrderCount },
    { label: "Orders (All)", value: orders },
  ];

  // ── Conversion trend chart data ──────────────────────────────────
  const orderBucketExpr =
    granularity === "day"
      ? sql`date_trunc('day', ${order.processedAt})::date`
      : granularity === "week"
        ? sql`date_trunc('week', ${order.processedAt})::date`
        : sql`date_trunc('month', ${order.processedAt})::date`;

  const [sessionsByBucket, ordersByBucket] = await Promise.all([
    db
      .select({
        bucket: sql`date_trunc('${sql.raw(granularity)}', ${ga4Daily.date})::date`,
        sessions: sum(ga4Daily.sessions).mapWith(Number),
      })
      .from(ga4Daily)
      .where(and(gte(ga4Daily.date, from), lte(ga4Daily.date, to)))
      .groupBy(
        sql`date_trunc('${sql.raw(granularity)}', ${ga4Daily.date})::date`,
      ),
    db
      .select({
        bucket: orderBucketExpr,
        orders: count(),
      })
      .from(order)
      .where(
        and(
          gte(order.processedAt, from),
          lte(order.processedAt, to),
          sql`${order.sourceName} = 'web'`,
        ),
      )
      .groupBy(orderBucketExpr),
  ]);

  const bucketKeys = generateBucketKeys(from, to, granularity);
  const sessionsMap = new Map<string, number>();
  for (const row of sessionsByBucket) {
    sessionsMap.set(
      dateToBucketKey(new Date(row.bucket as string), granularity),
      row.sessions ?? 0,
    );
  }
  const ordersMap = new Map<string, number>();
  for (const row of ordersByBucket) {
    ordersMap.set(
      dateToBucketKey(new Date(row.bucket as string), granularity),
      row.orders ?? 0,
    );
  }
  const conversionTrendData = bucketKeys.map((key) => {
    const s = sessionsMap.get(key) ?? 0;
    const o = ordersMap.get(key) ?? 0;
    return {
      bucket: key,
      label: formatBucketLabel(key, granularity),
      sessions: s,
      orders: o,
      conversionRate: s > 0 ? (o / s) * 100 : 0,
    };
  });

  return (
    <div>
      <PageHeader title="Funnel" />

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="30d Revenue"
          value={fmt(revenue)}
        />
        <MetricCard
          label="30d Orders"
          value={orders.toLocaleString()}
        />
        <MetricCard
          label="New Customers"
          value={newCustomers.toLocaleString()}
        />
        <MetricCard
          label="Repeat Customers"
          value={repeatCount.toLocaleString()}
        />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Conversion Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ConversionTrendChart data={conversionTrendData} />
        </CardContent>
      </Card>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Funnel (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stages.map((stage, i) => {
                const prev = i > 0 ? stages[i - 1].value : stage.value;
                const width = stages[0].value > 0
                  ? Math.max(8, (stage.value / stages[0].value) * 100)
                  : 100;
                return (
                  <div key={stage.label}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span className="text-zinc-600">{stage.label}</span>
                      <span className="font-mono font-medium text-zinc-900">
                        {stage.value.toLocaleString()}
                        {i > 0 && (
                          <span className="ml-2 text-xs text-zinc-400">
                            {pct(stage.value, prev)} of prev
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-6 rounded bg-zinc-100">
                      <div
                        className="h-6 rounded bg-zinc-900 transition-all"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-zinc-400">
              Session → Purchase: <Mono>{pct(webOrderCount, sessions)}</Mono>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PostHog Event Funnel — Last 30 Days</CardTitle>
            <p className="mt-1 text-xs text-zinc-400">
              Cohort progression via HogQL <Mono>windowFunnel</Mono>: each
              count is the number of unique persons who reached at least
              this step within a 30-day window, in time order. Route-agnostic
              — entry can be any page.
            </p>
          </CardHeader>
          <CardContent>
            {posthogStages[0].count === 0 ? (
              <p className="text-sm text-zinc-400">
                No PostHog events in this window yet. Storefront snippet + Custom Pixel installed 2026-06-03 — data fills in as traffic accumulates.
              </p>
            ) : (
              <div className="space-y-4">
                {posthogStages.map((stage, i) => {
                  const prev = i > 0 ? posthogStages[i - 1].count : stage.count;
                  const width = posthogStages[0].count > 0
                    ? Math.max(8, (stage.count / posthogStages[0].count) * 100)
                    : 100;
                  return (
                    <div key={stage.name}>
                      <div className="mb-1 flex items-baseline justify-between text-sm">
                        <span className="text-zinc-600">{stage.name}</span>
                        <span className="font-mono font-medium text-zinc-900">
                          {stage.count.toLocaleString()}
                          {i > 0 && (
                            <span className="ml-2 text-xs text-zinc-400">
                              {pct(stage.count, prev)} of prev
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="h-6 rounded bg-zinc-100">
                        <div
                          className="h-6 rounded bg-zinc-900 transition-all"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Entry Pages — Last 30 Days</CardTitle>
            <p className="mt-1 text-xs text-zinc-400">
              Where visitors actually land. <Mono>conv.</Mono> = those visitors who later added to cart.
            </p>
          </CardHeader>
          <CardContent>
            {landingPages.length === 0 ? (
              <p className="text-sm text-zinc-400">
                No entry-page data yet.
              </p>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-baseline justify-between border-b border-zinc-100 pb-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  <span>Path</span>
                  <span className="flex gap-6">
                    <span>visitors</span>
                    <span className="w-16 text-right">conv.</span>
                  </span>
                </div>
                {landingPages.map((row) => {
                  const cvr = row.visitors > 0 ? (row.conversions / row.visitors) * 100 : 0;
                  return (
                    <div key={row.path} className="flex items-baseline justify-between gap-3 border-b border-zinc-50 pb-1.5 last:border-b-0">
                      <span className="truncate font-mono text-xs text-zinc-700">{row.path}</span>
                      <span className="flex shrink-0 items-baseline gap-6 font-mono text-xs">
                        <span className="text-zinc-900">{row.visitors.toLocaleString()}</span>
                        <span className="w-16 text-right text-zinc-500">
                          {row.conversions} <span className="text-[10px] text-zinc-400">({cvr.toFixed(1)}%)</span>
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Channel Breakdown (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-zinc-600">Web (DTC)</span>
                <span className="font-mono font-medium text-zinc-900">
                  {webOrderCount.toLocaleString()} orders
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-zinc-600">
                  Wholesale / Draft Orders
                </span>
                <span className="font-mono font-medium text-zinc-900">
                  {draftOrderCount.toLocaleString()} orders
                </span>
              </div>
              <div className="flex items-baseline justify-between border-t border-zinc-100 pt-4">
                <span className="text-sm font-medium text-zinc-900">
                  Total
                </span>
                <span className="font-mono font-medium text-zinc-900">
                  {orders.toLocaleString()} orders
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
