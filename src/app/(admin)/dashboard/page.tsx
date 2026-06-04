import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { order, customer, metaAdsDaily, googleAdsDaily } from "@/lib/schema";
import { sql, eq, desc, count, sum, gte, lte, and } from "drizzle-orm";
import { parseDateRange } from "@/lib/date-range";
import { STORE_TZ } from "@/lib/timezone";
import {
  formatBucketLabel,
  dateToBucketKey,
  generateBucketKeys,
} from "@/lib/chart-utils";
import { MetricCard } from "@/components/charts/metric-card";
import { RevenueTrendChart } from "@/components/charts/revenue-trend-chart";
import { AdSpendRevenueChart } from "@/components/charts/ad-spend-revenue-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mono, Muted } from "@/components/ui/data-table";
import { Camera } from "lucide-react";

export const metadata: Metadata = {
  title: "Dashboard | Fitwell Admin",
};

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const { from, to, granularity } = parseDateRange(params);

  // Bucket by the STORE timezone so the daily trend lines up with Shopify
  // (whose reports use the store day). Without `AT TIME ZONE`, evening-Pacific
  // orders fall into the next UTC day and the line is off by a day.
  const bucketExpr =
    granularity === "day"
      ? sql`date_trunc('day', (${order.processedAt} AT TIME ZONE ${sql.raw(`'${STORE_TZ}'`)}))::date`
      : granularity === "week"
        ? sql`date_trunc('week', (${order.processedAt} AT TIME ZONE ${sql.raw(`'${STORE_TZ}'`)}))::date`
        : sql`date_trunc('month', (${order.processedAt} AT TIME ZONE ${sql.raw(`'${STORE_TZ}'`)}))::date`;

  // "Total sales" reconciles with Shopify: each order's net contribution is
  // total_price minus refunds (which nets item/tax/shipping returns), summed
  // over orders that weren't cancelled. Pending/wholesale orders are included,
  // exactly as Shopify counts them — unlike the old paid-only "Revenue".
  const netSales = sql`COALESCE(SUM(${order.totalPrice} - ${order.totalRefunded}), 0)`.mapWith(Number);
  const notCancelled = sql`${order.cancelledAt} IS NULL`;

  // Segment by order source (no B2B customer tags exist in the data, so
  // `source_name` is the signal): B2B = wholesale draft orders, Trade Show =
  // in-person POS, D2C = web + everything else. (Literals in the CASE — no bound
  // params — so it's safe to reuse across SELECT + GROUP BY.)
  const segmentExpr = sql<string>`CASE
    WHEN ${order.sourceName} = 'shopify_draft_order' THEN 'b2b'
    WHEN ${order.sourceName} = 'pos' THEN 'tradeshow'
    ELSE 'd2c'
  END`;

  const [
    revenueResult,
    orderCountResult,
    customerCountResult,
    recentOrders,
    segmentResult,
    perCustomerLtv,
  ] = await Promise.all([
      db
        .select({ total: netSales })
        .from(order)
        .where(
          and(notCancelled, gte(order.processedAt, from), lte(order.processedAt, to)),
        ),
      db
        .select({ count: count() })
        .from(order)
        .where(
          and(notCancelled, gte(order.processedAt, from), lte(order.processedAt, to)),
        ),
      db
        .select({ count: count() })
        .from(customer)
        .where(and(gte(customer.createdAt, from), lte(customer.createdAt, to))),
      db
        .select({
          id: order.id,
          shopifyOrderNumber: order.shopifyOrderNumber,
          totalPrice: order.totalPrice,
          financialStatus: order.financialStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          processedAt: order.processedAt,
          customerFirstName: customer.firstName,
          customerLastName: customer.lastName,
          customerEmail: customer.email,
        })
        .from(order)
        .leftJoin(customer, eq(order.customerId, customer.id))
        .where(and(gte(order.processedAt, from), lte(order.processedAt, to)))
        .orderBy(desc(order.processedAt))
        .limit(10),
      db
        .select({ segment: segmentExpr, sales: netSales, orders: count() })
        .from(order)
        .where(
          and(notCancelled, gte(order.processedAt, from), lte(order.processedAt, to)),
        )
        .groupBy(segmentExpr),
      // Per-customer ALL-TIME aggregates (ignores the date filter) for LTV.
      // One row per customer: whether they're B2B (ever placed a draft order),
      // their net revenue to date, and their order count. No bound params.
      db
        .select({
          isB2b: sql<boolean>`bool_or(${order.sourceName} = 'shopify_draft_order')`,
          hasPos: sql<boolean>`bool_or(${order.sourceName} = 'pos')`,
          netRev: sql<number>`COALESCE(SUM(${order.totalPrice} - ${order.totalRefunded}), 0)`.mapWith(Number),
          orders: sql<number>`count(*)`.mapWith(Number),
        })
        .from(order)
        .where(and(notCancelled, sql`${order.customerId} IS NOT NULL`))
        .groupBy(order.customerId),
    ]);

  const totalRevenue = Number(revenueResult[0]?.total ?? 0);
  const totalOrders = orderCountResult[0]?.count ?? 0;
  const totalCustomers = customerCountResult[0]?.count ?? 0;
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  // B2B vs Consumer split of Total sales (same definition as the headline).
  const segOf = (name: string) =>
    segmentResult.find((s) => s.segment === name);
  const aov = (sales: number, orders: number) =>
    orders > 0 ? Math.round(sales / orders) : 0;
  const segments = [
    {
      label: "D2C (Online)",
      sales: Number(segOf("d2c")?.sales ?? 0),
      orders: segOf("d2c")?.orders ?? 0,
    },
    {
      label: "Trade Show",
      sales: Number(segOf("tradeshow")?.sales ?? 0),
      orders: segOf("tradeshow")?.orders ?? 0,
    },
    {
      label: "B2B (Wholesale)",
      sales: Number(segOf("b2b")?.sales ?? 0),
      orders: segOf("b2b")?.orders ?? 0,
    },
  ];

  // ── Customer Lifetime Value (historic, all-time) ─────────────────
  // Historic CLV = net revenue per customer to date — the assumption-free
  // industry-standard method (what Shopify reports as a customer's "lifetime
  // value"). A predictive CLV (AOV × frequency × lifespan) is intentionally NOT
  // used: the store is only ~6 months old, so a customer-lifespan/churn estimate
  // would be fabricated. Customer segment by priority: B2B (ever placed a draft
  // order) > Trade Show (ever bought in-person via POS) > D2C (purely online).
  // Tally per-customer rows in JS (small set).
  const ltvAgg = {
    d2c: { customers: 0, rev: 0, orders: 0, repeat: 0 },
    tradeshow: { customers: 0, rev: 0, orders: 0, repeat: 0 },
    b2b: { customers: 0, rev: 0, orders: 0, repeat: 0 },
  };
  for (const c of perCustomerLtv) {
    const bucket = c.isB2b
      ? ltvAgg.b2b
      : c.hasPos
        ? ltvAgg.tradeshow
        : ltvAgg.d2c;
    bucket.customers += 1;
    bucket.rev += c.netRev ?? 0;
    bucket.orders += c.orders ?? 0;
    if ((c.orders ?? 0) > 1) bucket.repeat += 1;
  }
  const ltvRows = [
    { label: "D2C (Online)", ...ltvAgg.d2c },
    { label: "Trade Show", ...ltvAgg.tradeshow },
    { label: "B2B (Wholesale)", ...ltvAgg.b2b },
  ].map((s) => ({
    label: s.label,
    avgLtv: s.customers > 0 ? Math.round(s.rev / s.customers) : 0,
    avgOrders: s.customers > 0 ? s.orders / s.customers : 0,
    repeatRate: s.customers > 0 ? Math.round((s.repeat / s.customers) * 100) : 0,
    customers: s.customers,
  }));

  // ── Chart data: Revenue trend + Ad Spend vs Revenue ──────────────
  const [revenueByBucket, metaByBucket, googleByBucket, orderRevenueByBucket] =
    await Promise.all([
      db
        .select({
          bucket: bucketExpr,
          channel: sql<string>`CASE
            WHEN ${order.sourceName} != 'web' THEN 'wholesale'
            WHEN ${order.landingSite} ILIKE '%utm_source=meta%' OR ${order.landingSite} ILIKE '%utm_source=ig%' OR ${order.landingSite} ILIKE '%utm_source=fb%' OR ${order.landingSite} ILIKE '%utm_source=instagram%' OR ${order.referringSite} ILIKE '%facebook.com%' OR ${order.referringSite} ILIKE '%instagram.com%' THEN 'meta'
            WHEN ${order.landingSite} ILIKE '%gad_source%' OR ${order.landingSite} ILIKE '%gclid%' OR ${order.landingSite} ILIKE '%utm_source=google%' THEN 'google'
            ELSE 'organic'
          END`,
          revenue: netSales,
        })
        .from(order)
        .where(
          and(
            notCancelled,
            gte(order.processedAt, from),
            lte(order.processedAt, to),
          ),
        )
        .groupBy(bucketExpr, sql`CASE
            WHEN ${order.sourceName} != 'web' THEN 'wholesale'
            WHEN ${order.landingSite} ILIKE '%utm_source=meta%' OR ${order.landingSite} ILIKE '%utm_source=ig%' OR ${order.landingSite} ILIKE '%utm_source=fb%' OR ${order.landingSite} ILIKE '%utm_source=instagram%' OR ${order.referringSite} ILIKE '%facebook.com%' OR ${order.referringSite} ILIKE '%instagram.com%' THEN 'meta'
            WHEN ${order.landingSite} ILIKE '%gad_source%' OR ${order.landingSite} ILIKE '%gclid%' OR ${order.landingSite} ILIKE '%utm_source=google%' THEN 'google'
            ELSE 'organic'
          END`)
        .orderBy(bucketExpr),
      db
        .select({
          bucket: sql`date_trunc('${sql.raw(granularity)}', ${metaAdsDaily.date})::date`,
          spend: sum(metaAdsDaily.cost).mapWith(Number),
        })
        .from(metaAdsDaily)
        .where(and(gte(metaAdsDaily.date, from), lte(metaAdsDaily.date, to)))
        .groupBy(
          sql`date_trunc('${sql.raw(granularity)}', ${metaAdsDaily.date})::date`,
        ),
      db
        .select({
          bucket: sql`date_trunc('${sql.raw(granularity)}', ${googleAdsDaily.date})::date`,
          spend: sum(googleAdsDaily.cost).mapWith(Number),
        })
        .from(googleAdsDaily)
        .where(
          and(gte(googleAdsDaily.date, from), lte(googleAdsDaily.date, to)),
        )
        .groupBy(
          sql`date_trunc('${sql.raw(granularity)}', ${googleAdsDaily.date})::date`,
        ),
      db
        .select({
          bucket: bucketExpr,
          revenue: netSales,
        })
        .from(order)
        .where(
          and(
            notCancelled,
            gte(order.processedAt, from),
            lte(order.processedAt, to),
            sql`${order.sourceName} = 'web'`,
          ),
        )
        .groupBy(bucketExpr)
        .orderBy(bucketExpr),
    ]);

  // Build revenue trend data by channel
  const bucketKeys = generateBucketKeys(from, to, granularity);
  const revenueMap = new Map<string, { wholesale: number; organic: number; meta: number; google: number }>();
  for (const key of bucketKeys) {
    revenueMap.set(key, { wholesale: 0, organic: 0, meta: 0, google: 0 });
  }
  for (const row of revenueByBucket) {
    const key = dateToBucketKey(new Date(row.bucket as string), granularity);
    const entry = revenueMap.get(key) ?? { wholesale: 0, organic: 0, meta: 0, google: 0 };
    const channel = (row.channel as string) ?? "organic";
    if (channel in entry) entry[channel as keyof typeof entry] += row.revenue ?? 0;
    revenueMap.set(key, entry);
  }
  const revenueTrendData = bucketKeys.map((key) => ({
    bucket: key,
    label: formatBucketLabel(key, granularity),
    ...revenueMap.get(key)!,
  }));

  // Build ad spend vs revenue data
  const metaSpendMap = new Map<string, number>();
  for (const row of metaByBucket) {
    metaSpendMap.set(
      dateToBucketKey(new Date(row.bucket as string), granularity),
      row.spend ?? 0,
    );
  }
  const googleSpendMap = new Map<string, number>();
  for (const row of googleByBucket) {
    googleSpendMap.set(
      dateToBucketKey(new Date(row.bucket as string), granularity),
      row.spend ?? 0,
    );
  }
  const orderRevenueMap = new Map<string, number>();
  for (const row of orderRevenueByBucket) {
    orderRevenueMap.set(
      dateToBucketKey(new Date(row.bucket as string), granularity),
      row.revenue ?? 0,
    );
  }
  const adSpendRevenueData = bucketKeys.map((key) => {
    const metaSpend = metaSpendMap.get(key) ?? 0;
    const googleSpend = googleSpendMap.get(key) ?? 0;
    const revenue = orderRevenueMap.get(key) ?? 0;
    const totalSpend = metaSpend + googleSpend;
    return {
      bucket: key,
      label: formatBucketLabel(key, granularity),
      metaSpend,
      googleSpend,
      revenue,
      roas: totalSpend > 0 ? revenue / totalSpend : 0,
    };
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Dashboard" />
        {/* Fast path to the trade-show capture flow — the dashboard is where
            you land on login, so this is the quickest way to a new lead. */}
        <Button asChild size="lg">
          <Link href="/leads/capture">
            <Camera className="h-5 w-5" /> Capture Business Card
          </Link>
        </Button>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total sales" value={fmt(totalRevenue)} />
        <MetricCard label="Orders" value={totalOrders.toLocaleString()} />
        <MetricCard label="Customers" value={totalCustomers.toLocaleString()} />
        <MetricCard label="Avg Order Value" value={fmt(avgOrderValue)} />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Sales by Segment</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segment</TableHead>
                <TableHead className="text-right">Total sales</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Avg order</TableHead>
                <TableHead className="text-right">% of sales</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.map((s) => (
                <TableRow key={s.label}>
                  <TableCell className="font-medium text-zinc-900">
                    {s.label}
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{fmt(s.sales)}</Mono>
                  </TableCell>
                  <TableCell className="text-right">
                    {s.orders.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{fmt(aov(s.sales, s.orders))}</Mono>
                  </TableCell>
                  <TableCell className="text-right text-zinc-500">
                    {totalRevenue > 0
                      ? `${Math.round((s.sales / totalRevenue) * 100)}%`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Avg Lifetime Value (LTV)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-zinc-500">
            Historic CLV — net revenue per customer to date. All-time, so this
            does <em>not</em> change with the date filter above. Customers are
            bucketed by priority: B2B (ever ordered wholesale) → Trade Show (ever
            bought in-person) → D2C (purely online).
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segment</TableHead>
                <TableHead className="text-right">Avg LTV</TableHead>
                <TableHead className="text-right">Avg orders / customer</TableHead>
                <TableHead className="text-right">Repeat rate</TableHead>
                <TableHead className="text-right">Customers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ltvRows.map((s) => (
                <TableRow key={s.label}>
                  <TableCell className="font-medium text-zinc-900">
                    {s.label}
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{fmt(s.avgLtv)}</Mono>
                  </TableCell>
                  <TableCell className="text-right">
                    {s.avgOrders.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right text-zinc-500">
                    {s.repeatRate}%
                  </TableCell>
                  <TableCell className="text-right text-zinc-500">
                    {s.customers.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart data={revenueTrendData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ad Spend vs Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <AdSpendRevenueChart data={adSpendRevenueData} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fulfillment</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOrders.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-zinc-400"
                  >
                    No orders yet. Run the Shopify sync to populate data.
                  </TableCell>
                </TableRow>
              ) : (
                recentOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Muted>{o.shopifyOrderNumber}</Muted>
                    </TableCell>
                    <TableCell className="font-medium text-zinc-900">
                      {o.customerFirstName} {o.customerLastName}
                    </TableCell>
                    <TableCell>
                      <Mono>{fmt(o.totalPrice ?? 0)}</Mono>
                    </TableCell>
                    <TableCell>
                      <Badge>{o.financialStatus ?? "—"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge>{o.fulfillmentStatus ?? "unfulfilled"}</Badge>
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {o.processedAt
                        ? o.processedAt.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
