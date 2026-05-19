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
import { SortableCampaignTable } from "./sortable-table";

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
          platform: metaAdsDaily.platform,
        })
        .from(metaAdsDaily)
        .where(metaDateRange)
        .groupBy(
          metaAdsDaily.campaignName,
          metaAdsDaily.adsetName,
          metaAdsDaily.adName,
          metaAdsDaily.platform,
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

  // ── Build unified rows for sortable table ─────────────────────────
  const allRows = [
    ...metaAds.map((row) => {
      const impressions = row.impressions ?? 0;
      const clicks = row.clicks ?? 0;
      const cost = row.cost ?? 0;
      const conversions = row.conversions ?? 0;
      const revenue = row.revenue ?? 0;
      const revCents = Math.round(revenue * 100);
      const ctr = impressions > 0 ? clicks / impressions : 0;
      const cpc = clicks > 0 ? cost / clicks : 0;
      const roas = cost > 0 ? revCents / cost : 0;
      return {
        platform: row.platform ?? "meta",
        campaignName: row.campaignName ?? "—",
        adsetName: row.adsetName ?? null,
        adName: row.adName ?? null,
        impressions,
        clicks,
        cost,
        ctr,
        cpc,
        conversions,
        revenue: revCents,
        roas,
        classificationBadge: <ClassificationBadge revenue={revCents} spend={cost} />,
        platformBadge: <PlatformBadge platform={row.platform ?? "meta"} />,
        roasBadge: <RoasBadge revenue={revCents} spend={cost} />,
      };
    }),
    ...adCampaigns.map((row) => {
      const impressions = row.impressions ?? 0;
      const clicks = row.clicks ?? 0;
      const cost = row.cost ?? 0;
      const ctr = impressions > 0 ? clicks / impressions : 0;
      const cpc = clicks > 0 ? cost / clicks : 0;
      return {
        platform: "google",
        campaignName: row.campaignName ?? "—",
        adsetName: null,
        adName: null,
        impressions,
        clicks,
        cost,
        ctr,
        cpc,
        conversions: 0,
        revenue: 0,
        roas: 0,
        classificationBadge: null as React.ReactNode,
        platformBadge: <PlatformBadge platform="google" />,
        roasBadge: <span className="text-zinc-300">&mdash;</span> as React.ReactNode,
      };
    }),
  ];

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

      {/* ── Charts ───────────────────────────────────────────────── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Ad Spend vs Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <AdSpendRevenueChart data={adSpendRevenueData} />
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
          <div className="mt-2 flex flex-wrap gap-3">
            {CLASSIFICATIONS.map((c) => (
              <div key={c.cls} className="flex items-center gap-1.5">
                <span className={`inline-flex h-4 items-center rounded px-1.5 text-[10px] font-semibold ${c.style}`}>
                  {c.label}
                </span>
                <span className="text-[11px] text-zinc-400">{c.desc}</span>
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {allRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">
              No campaign data for this period.
            </p>
          ) : (
            <SortableCampaignTable
              rows={allRows}
              totals={{
                impressions: totalImpressions,
                clicks: totalClicks,
                cost: totalSpend,
                conversions: totalConversions,
                revenue: metaRevenueCents,
                roas: blendedRoas,
                roasBadge: <RoasBadge revenue={metaRevenueCents} spend={totalSpend} />,
              }}
            />
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

type Classification = "winner" | "promising" | "underperforming" | "dead";

const CLASSIFICATIONS: {
  cls: Classification;
  label: string;
  roasMin: number;
  style: string;
  desc: string;
}[] = [
  { cls: "winner", label: "Winner", roasMin: 1.5, style: "bg-emerald-600 text-white", desc: "ROAS ≥ 1.5x — profitable" },
  { cls: "promising", label: "Promising", roasMin: 0.5, style: "bg-blue-600 text-white", desc: "ROAS ≥ 0.5x — approaching profitability" },
  { cls: "underperforming", label: "Underperforming", roasMin: 0.1, style: "bg-amber-500 text-white", desc: "ROAS ≥ 0.1x — needs optimization" },
  { cls: "dead", label: "Dead", roasMin: 0, style: "bg-red-600 text-white", desc: "ROAS < 0.1x — consider pausing" },
];

function classify(revenue: number, spend: number): Classification {
  if (spend === 0) return "dead";
  const r = revenue / spend;
  if (r >= 1.5) return "winner";
  if (r >= 0.5) return "promising";
  if (r >= 0.1) return "underperforming";
  return "dead";
}

function ClassificationBadge({ revenue, spend }: { revenue: number; spend: number }) {
  const cls = classify(revenue, spend);
  const def = CLASSIFICATIONS.find((c) => c.cls === cls)!;
  return (
    <span
      className={`inline-flex h-4 items-center rounded px-1.5 text-[10px] font-semibold ${def.style}`}
      title={def.desc}
    >
      {def.label}
    </span>
  );
}

function RoasBadge({ revenue, spend }: { revenue: number; spend: number }) {
  if (spend === 0) return <span className="text-zinc-300">&mdash;</span>;
  const r = revenue / spend;
  const cls = classify(revenue, spend);
  const def = CLASSIFICATIONS.find((c) => c.cls === cls)!;
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${def.style}`}
    >
      {r.toFixed(2)}x
    </span>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const p = platform?.toLowerCase() ?? "";
  const styles: Record<string, string> = {
    facebook: "bg-blue-700 text-white",
    instagram: "bg-gradient-to-r from-purple-600 to-pink-500 text-white",
    threads: "bg-zinc-900 text-white",
    audience_network: "bg-blue-400 text-white",
    messenger: "bg-blue-500 text-white",
    google: "bg-amber-500 text-white",
  };
  const labels: Record<string, string> = {
    facebook: "FB",
    instagram: "IG",
    threads: "Threads",
    audience_network: "AN",
    messenger: "Msgr",
    google: "Google",
    unknown: "Meta",
  };
  const cls = styles[p] ?? "bg-zinc-500 text-white";
  const label = labels[p] ?? platform ?? "Meta";
  return (
    <span
      className={`inline-flex h-4 items-center rounded px-1.5 text-[10px] font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}
