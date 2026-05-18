import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { order, customer, metaAdsDaily, googleAdsDaily } from "@/lib/schema";
import { sql, eq, desc, count, sum, gte, lte, and } from "drizzle-orm";
import { parseDateRange } from "@/lib/date-range";
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
import { Mono, Muted } from "@/components/ui/data-table";

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

  const bucketExpr =
    granularity === "day"
      ? sql`date_trunc('day', ${order.processedAt})::date`
      : granularity === "week"
        ? sql`date_trunc('week', ${order.processedAt})::date`
        : sql`date_trunc('month', ${order.processedAt})::date`;

  const [revenueResult, orderCountResult, customerCountResult, recentOrders] =
    await Promise.all([
      db
        .select({ total: sum(order.totalPrice) })
        .from(order)
        .where(
          and(
            sql`${order.financialStatus} IN ('paid', 'partially_refunded')`,
            gte(order.processedAt, from),
            lte(order.processedAt, to),
          ),
        ),
      db
        .select({ count: count() })
        .from(order)
        .where(and(gte(order.processedAt, from), lte(order.processedAt, to))),
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
    ]);

  const totalRevenue = Number(revenueResult[0]?.total ?? 0);
  const totalOrders = orderCountResult[0]?.count ?? 0;
  const totalCustomers = customerCountResult[0]?.count ?? 0;
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  // ── Chart data: Revenue trend + Ad Spend vs Revenue ──────────────
  const [revenueByBucket, metaByBucket, googleByBucket, orderRevenueByBucket] =
    await Promise.all([
      db
        .select({
          bucket: bucketExpr,
          sourceName: order.sourceName,
          revenue: sum(order.totalPrice).mapWith(Number),
        })
        .from(order)
        .where(
          and(
            gte(order.processedAt, from),
            lte(order.processedAt, to),
            sql`${order.financialStatus} IN ('paid', 'partially_refunded')`,
          ),
        )
        .groupBy(bucketExpr, order.sourceName)
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
          revenue: sum(order.totalPrice).mapWith(Number),
        })
        .from(order)
        .where(
          and(
            gte(order.processedAt, from),
            lte(order.processedAt, to),
            sql`${order.financialStatus} IN ('paid', 'partially_refunded')`,
            sql`${order.sourceName} = 'web'`,
          ),
        )
        .groupBy(bucketExpr)
        .orderBy(bucketExpr),
    ]);

  // Build revenue trend data
  const bucketKeys = generateBucketKeys(from, to, granularity);
  const revenueMap = new Map<string, { web: number; wholesale: number }>();
  for (const key of bucketKeys) {
    revenueMap.set(key, { web: 0, wholesale: 0 });
  }
  for (const row of revenueByBucket) {
    const key = dateToBucketKey(new Date(row.bucket as string), granularity);
    const entry = revenueMap.get(key) ?? { web: 0, wholesale: 0 };
    if (row.sourceName === "web") entry.web += row.revenue ?? 0;
    else entry.wholesale += row.revenue ?? 0;
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
      <PageHeader title="Dashboard" />

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Revenue" value={fmt(totalRevenue)} />
        <MetricCard label="Orders" value={totalOrders.toLocaleString()} />
        <MetricCard label="Customers" value={totalCustomers.toLocaleString()} />
        <MetricCard label="Avg Order Value" value={fmt(avgOrderValue)} />
      </div>

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
