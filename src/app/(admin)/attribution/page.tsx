import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { order, customer } from "@/lib/schema";
import { sql, desc, count, sum, and, gte, lte } from "drizzle-orm";
import { parseDateRange } from "@/lib/date-range";
import {
  formatBucketLabel,
  dateToBucketKey,
  generateBucketKeys,
} from "@/lib/chart-utils";
import { RevenueTrendChart } from "@/components/charts/revenue-trend-chart";
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

export const metadata: Metadata = {
  title: "Attribution | Fitwell Admin",
};

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function AttributionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const { from, to, granularity } = parseDateRange(params);

  const [byReferrer, byLandingPage, byUtm] = await Promise.all([
    db
      .select({
        referringSite: order.referringSite,
        orders: count(),
        revenue: sum(order.totalPrice),
      })
      .from(order)
      .where(
        and(
          sql`${order.referringSite} IS NOT NULL`,
          gte(order.processedAt, from),
          lte(order.processedAt, to),
        ),
      )
      .groupBy(order.referringSite)
      .orderBy(desc(count()))
      .limit(15),

    db
      .select({
        landingSite: sql<string>`split_part(${order.landingSite}, '?', 1)`,
        orders: count(),
        revenue: sum(order.totalPrice),
      })
      .from(order)
      .where(
        and(
          sql`${order.landingSite} IS NOT NULL`,
          gte(order.processedAt, from),
          lte(order.processedAt, to),
        ),
      )
      .groupBy(sql`split_part(${order.landingSite}, '?', 1)`)
      .orderBy(desc(count()))
      .limit(15),

    db
      .select({
        utmSource: customer.utmSource,
        utmMedium: customer.utmMedium,
        utmCampaign: customer.utmCampaign,
        customers: count(),
      })
      .from(customer)
      .where(
        and(
          sql`${customer.utmSource} IS NOT NULL`,
          gte(customer.createdAt, from),
          lte(customer.createdAt, to),
        ),
      )
      .groupBy(customer.utmSource, customer.utmMedium, customer.utmCampaign)
      .orderBy(desc(count()))
      .limit(15),
  ]);

  // ── Revenue by source over time chart ──────────────────────────────
  const bucketExpr =
    granularity === "day"
      ? sql`date_trunc('day', ${order.processedAt})::date`
      : granularity === "week"
        ? sql`date_trunc('week', ${order.processedAt})::date`
        : sql`date_trunc('month', ${order.processedAt})::date`;

  const channelExpr = sql`CASE
    WHEN ${order.sourceName} != 'web' THEN 'wholesale'
    WHEN ${order.landingSite} ILIKE '%utm_source=meta%' OR ${order.landingSite} ILIKE '%utm_source=ig%' OR ${order.landingSite} ILIKE '%utm_source=fb%' OR ${order.landingSite} ILIKE '%utm_source=instagram%' OR ${order.referringSite} ILIKE '%facebook.com%' OR ${order.referringSite} ILIKE '%instagram.com%' THEN 'meta'
    WHEN ${order.landingSite} ILIKE '%gad_source%' OR ${order.landingSite} ILIKE '%gclid%' OR ${order.landingSite} ILIKE '%utm_source=google%' THEN 'google'
    ELSE 'organic'
  END`;

  const revenueByBucketAndChannel = await db
    .select({
      bucket: bucketExpr,
      channel: channelExpr,
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
    .groupBy(bucketExpr, channelExpr)
    .orderBy(bucketExpr);

  const bucketKeys = generateBucketKeys(from, to, granularity);
  const revenueMap = new Map<string, { wholesale: number; organic: number; meta: number; google: number }>();
  for (const key of bucketKeys) {
    revenueMap.set(key, { wholesale: 0, organic: 0, meta: 0, google: 0 });
  }
  for (const row of revenueByBucketAndChannel) {
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

  return (
    <div>
      <PageHeader title="Attribution" />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Revenue by Channel Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueTrendChart data={revenueTrendData} />
        </CardContent>
      </Card>

      <div className="mt-6 space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Referring Site</CardTitle>
          </CardHeader>
          <CardContent className="max-h-64 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referrer</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byReferrer.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-sm break-all">
                      {row.referringSite}
                    </TableCell>
                    <TableCell className="text-right">{row.orders}</TableCell>
                    <TableCell className="text-right">
                      {fmt(Number(row.revenue ?? 0))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Landing Page</CardTitle>
          </CardHeader>
          <CardContent className="max-h-64 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byLandingPage.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-sm break-all">
                      {row.landingSite}
                    </TableCell>
                    <TableCell className="text-right">{row.orders}</TableCell>
                    <TableCell className="text-right">
                      {fmt(Number(row.revenue ?? 0))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">UTM Attribution (Customers)</CardTitle>
          </CardHeader>
          <CardContent className="max-h-64 overflow-auto">
            {byUtm.length === 0 ? (
              <p className="text-sm text-zinc-400">
                No UTM data captured yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Medium</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right">Customers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byUtm.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">
                        {row.utmSource}
                      </TableCell>
                      <TableCell>{row.utmMedium ?? "—"}</TableCell>
                      <TableCell className="text-sm break-all">
                        {row.utmCampaign ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.customers}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
