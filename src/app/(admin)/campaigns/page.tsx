import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ga4Daily, googleAdsDaily, metaAdsDaily, order } from "@/lib/schema";
import { sql, desc, sum, count, and, gte, lte } from "drizzle-orm";
import { parseDateRange } from "@/lib/date-range";
import {
  formatBucketLabel,
  dateToBucketKey,
  generateBucketKeys,
} from "@/lib/chart-utils";
import { AdSpendRevenueChart } from "@/components/charts/ad-spend-revenue-chart";
import { TrafficSourcesChart } from "@/components/charts/traffic-sources-chart";
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
import { MetricCard } from "@/components/charts/metric-card";
import { DataTable, Mono } from "@/components/ui/data-table";

export const metadata: Metadata = {
  title: "Campaigns | Fitwell Admin",
};

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const { from, to, granularity } = parseDateRange(params);

  const ga4DateRange = and(gte(ga4Daily.date, from), lte(ga4Daily.date, to));
  const adsDateRange = and(
    gte(googleAdsDaily.date, from),
    lte(googleAdsDaily.date, to),
  );

  const metaDateRange = and(
    gte(metaAdsDaily.date, from),
    lte(metaAdsDaily.date, to),
  );

  const [trafficBySource, totalTraffic, adCampaigns, metaCampaigns] = await Promise.all([
    db
      .select({
        source: ga4Daily.source,
        medium: ga4Daily.medium,
        sessions: sum(ga4Daily.sessions).mapWith(Number),
        users: sum(ga4Daily.users).mapWith(Number),
      })
      .from(ga4Daily)
      .where(ga4DateRange)
      .groupBy(ga4Daily.source, ga4Daily.medium)
      .orderBy(desc(sum(ga4Daily.sessions)))
      .limit(15),

    db
      .select({
        sessions: sum(ga4Daily.sessions).mapWith(Number),
        users: sum(ga4Daily.users).mapWith(Number),
        pageviews: sum(ga4Daily.pageviews).mapWith(Number),
        days: count(),
      })
      .from(ga4Daily)
      .where(ga4DateRange),

    db
      .select({
        campaignName: googleAdsDaily.campaignName,
        impressions: sum(googleAdsDaily.impressions).mapWith(Number),
        clicks: sum(googleAdsDaily.clicks).mapWith(Number),
        cost: sum(googleAdsDaily.cost).mapWith(Number),
      })
      .from(googleAdsDaily)
      .where(adsDateRange)
      .groupBy(googleAdsDaily.campaignName)
      .orderBy(desc(sum(googleAdsDaily.clicks))),

    db
      .select({
        campaignName: metaAdsDaily.campaignName,
        impressions: sum(metaAdsDaily.impressions).mapWith(Number),
        clicks: sum(metaAdsDaily.clicks).mapWith(Number),
        cost: sum(metaAdsDaily.cost).mapWith(Number),
        conversions: sum(metaAdsDaily.conversions).mapWith(Number),
        revenue: sum(metaAdsDaily.conversionValue).mapWith(Number),
        reach: sum(metaAdsDaily.reach).mapWith(Number),
      })
      .from(metaAdsDaily)
      .where(metaDateRange)
      .groupBy(metaAdsDaily.campaignName)
      .orderBy(desc(sum(metaAdsDaily.clicks))),
  ]);

  const totals = totalTraffic[0] ?? {
    sessions: 0,
    users: 0,
    pageviews: 0,
    days: 0,
  };

  // ── Chart data: Ad Spend vs Revenue + Traffic Sources ────────────
  const orderBucketExpr =
    granularity === "day"
      ? sql`date_trunc('day', ${order.processedAt})::date`
      : granularity === "week"
        ? sql`date_trunc('week', ${order.processedAt})::date`
        : sql`date_trunc('month', ${order.processedAt})::date`;

  const [metaByBucket, googleByBucket, orderRevenueByBucket] =
    await Promise.all([
      db
        .select({
          bucket: sql`date_trunc('${sql.raw(granularity)}', ${metaAdsDaily.date})::date`,
          spend: sum(metaAdsDaily.cost).mapWith(Number),
        })
        .from(metaAdsDaily)
        .where(metaDateRange)
        .groupBy(
          sql`date_trunc('${sql.raw(granularity)}', ${metaAdsDaily.date})::date`,
        ),
      db
        .select({
          bucket: sql`date_trunc('${sql.raw(granularity)}', ${googleAdsDaily.date})::date`,
          spend: sum(googleAdsDaily.cost).mapWith(Number),
        })
        .from(googleAdsDaily)
        .where(adsDateRange)
        .groupBy(
          sql`date_trunc('${sql.raw(granularity)}', ${googleAdsDaily.date})::date`,
        ),
      db
        .select({
          bucket: orderBucketExpr,
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
        .groupBy(orderBucketExpr)
        .orderBy(orderBucketExpr),
    ]);

  const bucketKeys = generateBucketKeys(from, to, granularity);
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

  const trafficSourcesData = trafficBySource.map((row) => ({
    source: `${row.source ?? "(none)"}/${row.medium ?? "(none)"}`,
    sessions: row.sessions ?? 0,
    users: row.users ?? 0,
  }));

  return (
    <div>
      <PageHeader title="Campaigns & Traffic" />

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Sessions (GA4)"
          value={(totals.sessions ?? 0).toLocaleString()}
        />
        <MetricCard
          label="Users"
          value={(totals.users ?? 0).toLocaleString()}
        />
        <MetricCard
          label="Pageviews"
          value={(totals.pageviews ?? 0).toLocaleString()}
        />
        <MetricCard
          label="Days of Data"
          value={(totals.days ?? 0).toLocaleString()}
        />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Ad Spend vs Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <AdSpendRevenueChart data={adSpendRevenueData} />
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Traffic Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <TrafficSourcesChart data={trafficSourcesData} />
        </CardContent>
      </Card>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Traffic by Source / Medium</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Medium</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trafficBySource.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-zinc-400"
                    >
                      No GA4 data yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  trafficBySource.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-zinc-900">
                        {row.source ?? "—"}
                      </TableCell>
                      <TableCell className="text-zinc-500">
                        {row.medium ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Mono>{(row.sessions ?? 0).toLocaleString()}</Mono>
                      </TableCell>
                      <TableCell className="text-right">
                        <Mono>{(row.users ?? 0).toLocaleString()}</Mono>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Google Ads Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            {adCampaigns.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-400">
                No Google Ads data yet. Requires service account access + developer token.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adCampaigns.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-zinc-900">
                        {row.campaignName ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Mono>{(row.clicks ?? 0).toLocaleString()}</Mono>
                      </TableCell>
                      <TableCell className="text-right">
                        <Mono>{(row.impressions ?? 0).toLocaleString()}</Mono>
                      </TableCell>
                      <TableCell className="text-right">
                        <Mono>{fmt(row.cost ?? 0)}</Mono>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Meta Ads Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            {metaCampaigns.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-400">
                No Meta Ads data for this period.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Reach</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Conversions</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metaCampaigns.map((row, i) => {
                    const roas =
                      row.cost && row.cost > 0
                        ? ((row.revenue ?? 0) / (row.cost / 100)).toFixed(1)
                        : "—";
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-zinc-900">
                          {row.campaignName ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Mono>
                            {(row.impressions ?? 0).toLocaleString()}
                          </Mono>
                        </TableCell>
                        <TableCell className="text-right">
                          <Mono>{(row.clicks ?? 0).toLocaleString()}</Mono>
                        </TableCell>
                        <TableCell className="text-right">
                          <Mono>{(row.reach ?? 0).toLocaleString()}</Mono>
                        </TableCell>
                        <TableCell className="text-right">
                          <Mono>{fmt(row.cost ?? 0)}</Mono>
                        </TableCell>
                        <TableCell className="text-right">
                          <Mono>{row.conversions ?? 0}</Mono>
                        </TableCell>
                        <TableCell className="text-right">
                          <Mono>
                            ${((row.revenue ?? 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Mono>
                        </TableCell>
                        <TableCell className="text-right">
                          <Mono>{roas}x</Mono>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
