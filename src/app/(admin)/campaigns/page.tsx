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
  TableFooter,
} from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/charts/metric-card";
import { Mono } from "@/components/ui/data-table";

export const metadata: Metadata = {
  title: "Campaigns | Fitwell Admin",
};

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function pct(value: number) {
  return `${(value * 100).toFixed(2)}%`;
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

  const [trafficBySource, totalTraffic, adCampaigns, metaAds] =
    await Promise.all([
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
          adsetName: metaAdsDaily.adsetName,
          adName: metaAdsDaily.adName,
          impressions: sum(metaAdsDaily.impressions).mapWith(Number),
          clicks: sum(metaAdsDaily.clicks).mapWith(Number),
          cost: sum(metaAdsDaily.cost).mapWith(Number),
          conversions: sum(metaAdsDaily.conversions).mapWith(Number),
          revenue: sum(metaAdsDaily.conversionValue).mapWith(Number),
          reach: sum(metaAdsDaily.reach).mapWith(Number),
        })
        .from(metaAdsDaily)
        .where(metaDateRange)
        .groupBy(
          metaAdsDaily.campaignName,
          metaAdsDaily.adsetName,
          metaAdsDaily.adName,
        )
        .orderBy(desc(sum(metaAdsDaily.cost))),
    ]);

  const totals = totalTraffic[0] ?? {
    sessions: 0,
    users: 0,
    pageviews: 0,
    days: 0,
  };

  // ── Summary metrics ────────────────────────────────────────────────
  const totalMetaSpend = metaAds.reduce((s, r) => s + (r.cost ?? 0), 0);
  const totalGoogleSpend = adCampaigns.reduce((s, r) => s + (r.cost ?? 0), 0);
  const totalSpend = totalMetaSpend + totalGoogleSpend;
  const totalMetaClicks = metaAds.reduce((s, r) => s + (r.clicks ?? 0), 0);
  const totalGoogleClicks = adCampaigns.reduce(
    (s, r) => s + (r.clicks ?? 0),
    0,
  );
  const totalClicks = totalMetaClicks + totalGoogleClicks;
  // Meta-reported conversion value (dollars) → cents
  const metaRevenueCents = Math.round(
    metaAds.reduce((s, r) => s + (r.revenue ?? 0), 0) * 100,
  );
  const blendedRoas =
    totalSpend > 0 ? metaRevenueCents / totalSpend : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

  // ── Aggregate table totals ────────────────────────────────────────
  const totalMetaImpressions = metaAds.reduce(
    (s, r) => s + (r.impressions ?? 0),
    0,
  );
  const totalMetaConversions = metaAds.reduce(
    (s, r) => s + (r.conversions ?? 0),
    0,
  );
  const totalGoogleImpressions = adCampaigns.reduce(
    (s, r) => s + (r.impressions ?? 0),
    0,
  );
  const totalImpressions = totalMetaImpressions + totalGoogleImpressions;
  const totalConversions = totalMetaConversions; // only Meta has pixel data
  const totalCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

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

      {/* ── GA4 Traffic Metrics ──────────────────────────────────── */}
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

      {/* ── Charts ───────────────────────────────────────────────── */}
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

      {/* ── Paid Channel Summary ─────────────────────────────────── */}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Ad Spend" value={fmt(totalSpend)} />
        <MetricCard label="Meta Revenue" value={fmt(metaRevenueCents)} />
        <MetricCard label="Blended ROAS" value={`${blendedRoas.toFixed(2)}x`} />
        <MetricCard label="Avg CPC" value={fmt(avgCpc)} />
      </div>

      {/* ── Campaign Performance Table ──────────────────────────── */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Campaign Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {metaAds.length === 0 && adCampaigns.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">
              No campaign data for this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 min-w-[320px] bg-white">
                    Path
                  </TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">CPC</TableHead>
                  <TableHead className="text-right">Conversions</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metaAds.map((row, i) => {
                  const impressions = row.impressions ?? 0;
                  const clicks = row.clicks ?? 0;
                  const cost = row.cost ?? 0;
                  const conversions = row.conversions ?? 0;
                  const revenue = row.revenue ?? 0;
                  const ctr = impressions > 0 ? clicks / impressions : 0;
                  const cpc = clicks > 0 ? cost / clicks : 0;
                  return (
                    <TableRow key={`meta-${i}`}>
                      <TableCell className="sticky left-0 bg-inherit">
                        <div className="flex items-center gap-2">
                          <PlatformBadge platform="meta" />
                          <span className="font-medium text-zinc-900">
                            {row.campaignName ?? "—"}
                          </span>
                        </div>
                        <div className="mt-0.5 pl-[calc(theme(spacing.2)+36px)] text-xs text-zinc-500">
                          {row.adsetName ?? "—"}
                        </div>
                        <div className="pl-[calc(theme(spacing.2)+36px)] text-xs text-zinc-400">
                          {row.adName ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Mono>{impressions.toLocaleString()}</Mono>
                      </TableCell>
                      <TableCell className="text-right">
                        <Mono>{clicks.toLocaleString()}</Mono>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono text-zinc-500">
                          {pct(ctr)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Mono>{fmt(cost)}</Mono>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono text-zinc-500">
                          {fmt(cpc)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Mono>{conversions.toLocaleString()}</Mono>
                      </TableCell>
                      <TableCell className="text-right">
                        <Mono>{fmt(Math.round(revenue * 100))}</Mono>
                      </TableCell>
                      <TableCell className="text-right">
                        <RoasBadge
                          revenue={Math.round(revenue * 100)}
                          spend={cost}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {adCampaigns.map((row, i) => {
                  const impressions = row.impressions ?? 0;
                  const clicks = row.clicks ?? 0;
                  const cost = row.cost ?? 0;
                  const ctr = impressions > 0 ? clicks / impressions : 0;
                  const cpc = clicks > 0 ? cost / clicks : 0;
                  return (
                    <TableRow key={`google-${i}`}>
                      <TableCell className="sticky left-0 bg-inherit">
                        <div className="flex items-center gap-2">
                          <PlatformBadge platform="google" />
                          <span className="font-medium text-zinc-900">
                            {row.campaignName ?? "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Mono>{impressions.toLocaleString()}</Mono>
                      </TableCell>
                      <TableCell className="text-right">
                        <Mono>{clicks.toLocaleString()}</Mono>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono text-zinc-500">
                          {pct(ctr)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Mono>{fmt(cost)}</Mono>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono text-zinc-500">
                          {fmt(cpc)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-zinc-300">&mdash;</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-zinc-300">&mdash;</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-zinc-300">&mdash;</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow className="font-medium">
                  <TableCell className="sticky left-0 bg-zinc-50/50">
                    Total
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{totalImpressions.toLocaleString()}</Mono>
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{totalClicks.toLocaleString()}</Mono>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-mono text-zinc-500">
                      {pct(totalCtr)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{fmt(totalSpend)}</Mono>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-mono text-zinc-500">
                      {fmt(avgCpc)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{totalConversions.toLocaleString()}</Mono>
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{fmt(metaRevenueCents)}</Mono>
                  </TableCell>
                  <TableCell className="text-right">
                    <RoasBadge
                      revenue={metaRevenueCents}
                      spend={totalSpend}
                    />
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Traffic by Source / Medium ────────────────────────────── */}
      <Card className="mt-8">
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
    </div>
  );
}

/* ── Inline components ──────────────────────────────────────────── */

function RoasBadge({ revenue, spend }: { revenue: number; spend: number }) {
  if (spend === 0) return <span className="text-zinc-300">&mdash;</span>;
  const r = revenue / spend;
  const cls =
    r >= 1.5
      ? "bg-emerald-600 text-white"
      : r >= 0.5
        ? "bg-blue-600 text-white"
        : r >= 0.1
          ? "bg-amber-500 text-white"
          : "bg-red-600 text-white";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${cls}`}
    >
      {r.toFixed(2)}x
    </span>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const cls =
    platform === "meta"
      ? "bg-blue-600 text-white"
      : platform === "google"
        ? "bg-amber-500 text-white"
        : "bg-emerald-600 text-white";
  const label =
    platform === "meta"
      ? "Meta"
      : platform === "google"
        ? "Google"
        : "Organic";
  return (
    <span
      className={`inline-flex h-4 items-center rounded px-1.5 text-[10px] font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}
