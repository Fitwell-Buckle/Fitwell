import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { order } from "@/lib/schema";
import { sql, desc, count, sum, and, gte, lte } from "drizzle-orm";
import { parseDateRange } from "@/lib/date-range";
import { STORE_TZ } from "@/lib/timezone";
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
import {
  getChannelPerformance,
  getLinkConfidence,
  getPixelAttributedChannelPerformance,
} from "@/lib/analytics/attribution";

export const metadata: Metadata = {
  title: "Attribution | Fitwell Admin",
};

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round((seconds / 3600) * 10) / 10}h`;
  return `${Math.round((seconds / 86400) * 10) / 10}d`;
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

  const [byReferrer, byLandingPage] = await Promise.all([
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
  ]);

  const [channelPerf, linkConfidence, pixelChannelPerf] = await Promise.all([
    getChannelPerformance(from, to),
    getLinkConfidence(from, to),
    getPixelAttributedChannelPerformance(from, to),
  ]);
  const linkTotal =
    linkConfidence.pixel +
    linkConfidence.emailMatch +
    linkConfidence.unattributed;

  // ── Revenue by source over time chart ──────────────────────────────
  const bucketExpr =
    granularity === "day"
      ? sql`date_trunc('day', (${order.processedAt} AT TIME ZONE ${STORE_TZ}))::date`
      : granularity === "week"
        ? sql`date_trunc('week', (${order.processedAt} AT TIME ZONE ${STORE_TZ}))::date`
        : sql`date_trunc('month', (${order.processedAt} AT TIME ZONE ${STORE_TZ}))::date`;

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
      <p className="mt-1.5 max-w-3xl text-xs text-zinc-500">
        Data sources: Shopify <code>order.landing_site</code> /{" "}
        <code>referring_site</code> (top three cards) and{" "}
        <code>customer.utm_source/medium</code> (the legacy first-touch
        card); the storefront PostHog snippet&apos;s{" "}
        <code>utm_attribution</code> table joined via{" "}
        <code>order.fw_distinct_id</code> (the pixel-attributed card);{" "}
        <code>order.link_method</code> (the pixel/email-match/unattributed
        confidence split). No GA4 — that lives on the Campaigns page.
      </p>

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
            <CardTitle className="text-lg">
              Channel Performance — Orders &amp; Revenue (first-touch)
            </CardTitle>
            <p className="mt-1 text-xs text-zinc-400">
              Attribution confidence in this window:{" "}
              {linkTotal === 0 ? (
                "no orders"
              ) : (
                <>
                  <span className="text-emerald-400">
                    {linkConfidence.pixel} pixel
                  </span>
                  {" · "}
                  <span className="text-amber-400">
                    {linkConfidence.emailMatch} email-match
                  </span>
                  {" · "}
                  <span className="text-zinc-500">
                    {linkConfidence.unattributed} unattributed
                  </span>
                </>
              )}
            </p>
          </CardHeader>
          <CardContent className="max-h-64 overflow-auto">
            {channelPerf.length === 0 ? (
              <p className="text-sm text-zinc-400">
                No orders in this date range.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {channelPerf.map((row) => (
                    <TableRow key={row.channel}>
                      <TableCell className="font-medium capitalize">
                        {row.channel.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell className="text-right">{row.orders}</TableCell>
                      <TableCell className="text-right">
                        {fmt(row.revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Pixel-attributed channel performance (true first-touch)
            </CardTitle>
            <p className="mt-1 text-xs text-zinc-400">
              Joins each order to the <em>storefront snippet&apos;s</em>{" "}
              earliest UTM capture for that visitor (via{" "}
              <code>fw_distinct_id</code>), not the converting visit&apos;s{" "}
              <code>landing_site</code>. Only pixel-linked orders qualify —
              effectively orders placed after the 2026-06-03 install.
              Time-to-convert is from first-touch capture to order placement.
            </p>
          </CardHeader>
          <CardContent className="max-h-64 overflow-auto">
            {pixelChannelPerf.length === 0 ? (
              <p className="text-sm text-zinc-400">
                No pixel-attributed orders in this date range yet. The
                snippet started populating fw_distinct_id on 2026-06-03; this
                card lights up as orders from post-deploy visitors come in.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">
                      Median time to convert
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pixelChannelPerf.map((row) => (
                    <TableRow key={row.channel}>
                      <TableCell className="font-medium capitalize">
                        {row.channel.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell className="text-right">{row.orders}</TableCell>
                      <TableCell className="text-right">
                        {fmt(row.revenue)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-zinc-600">
                        {fmtDuration(row.medianTimeToConvertSeconds)}
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
