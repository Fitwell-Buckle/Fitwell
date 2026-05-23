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
import { AdSpendRoasChart } from "@/components/charts/ad-spend-roas-chart";
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
          adGroupName: googleAdsDaily.adGroupName,
          adName: googleAdsDaily.adName,
          platform: googleAdsDaily.platform,
          landingUrl: googleAdsDaily.landingUrl,
          impressions: sum(googleAdsDaily.impressions).mapWith(Number),
          clicks: sum(googleAdsDaily.clicks).mapWith(Number),
          cost: sum(googleAdsDaily.cost).mapWith(Number),
          conversions: sum(googleAdsDaily.conversions).mapWith(Number),
          revenue: sum(googleAdsDaily.conversionValue).mapWith(Number),
        })
        .from(googleAdsDaily)
        .where(adsDateRange)
        .groupBy(
          googleAdsDaily.campaignName,
          googleAdsDaily.adGroupName,
          googleAdsDaily.adName,
          googleAdsDaily.platform,
          googleAdsDaily.landingUrl,
        )
        .orderBy(desc(sum(googleAdsDaily.cost))),

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
          landingUrl: metaAdsDaily.landingUrl,
        })
        .from(metaAdsDaily)
        .where(metaDateRange)
        .groupBy(
          metaAdsDaily.campaignName,
          metaAdsDaily.adsetName,
          metaAdsDaily.adName,
          metaAdsDaily.platform,
          metaAdsDaily.landingUrl,
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
  const metaRevenueCents = Math.round(
    metaAds.reduce((s, r) => s + (r.revenue ?? 0), 0) * 100,
  );
  const googleRevenueCents = Math.round(
    adCampaigns.reduce((s, r) => s + (r.revenue ?? 0), 0) * 100,
  );
  const totalRevenueCents = metaRevenueCents + googleRevenueCents;
  const blendedRoas =
    totalSpend > 0 ? totalRevenueCents / totalSpend : 0;
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
  const totalGoogleConversions = adCampaigns.reduce(
    (s, r) => s + (r.conversions ?? 0),
    0,
  );
  const totalConversions = totalMetaConversions + totalGoogleConversions;
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
        landingUrl: row.landingUrl ?? null,
        impressions,
        clicks,
        cost,
        ctr,
        cpc,
        conversions,
        revenue: revCents,
        roas,
        classificationBadge: <ClassificationBadge revenue={revCents} spend={cost} clicks={clicks} />,
        platformBadge: <PlatformBadge platform={row.platform ?? "meta"} />,
        roasBadge: <RoasBadge revenue={revCents} spend={cost} clicks={clicks} />,
      };
    }),
    ...adCampaigns.map((row) => {
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
        platform: row.platform ?? "google",
        campaignName: row.campaignName ?? "—",
        adsetName: row.adGroupName ?? null,
        adName: row.adName ?? null,
        landingUrl: row.landingUrl ?? null,
        impressions,
        clicks,
        cost,
        ctr,
        cpc,
        conversions,
        revenue: revCents,
        roas,
        classificationBadge: <ClassificationBadge revenue={revCents} spend={cost} clicks={clicks} />,
        platformBadge: <PlatformBadge platform={row.platform ?? "google"} />,
        roasBadge: <RoasBadge revenue={revCents} spend={cost} clicks={clicks} />,
      };
    }),
  ];

  // ── Chart data: Spend by channel + per-channel ROAS ─────────────
  const metaBucketExpr = sql`date_trunc('${sql.raw(granularity)}', ${metaAdsDaily.date})::date`;

  const [metaByPlatformBucket, googleByBucket] = await Promise.all([
    db
      .select({
        bucket: metaBucketExpr,
        platform: metaAdsDaily.platform,
        spend: sum(metaAdsDaily.cost).mapWith(Number),
        revenue: sql<number>`sum(${metaAdsDaily.conversionValue} * 100)::int`.mapWith(Number),
      })
      .from(metaAdsDaily)
      .where(metaDateRange)
      .groupBy(metaBucketExpr, metaAdsDaily.platform),
    db
      .select({
        bucket: sql`date_trunc('${sql.raw(granularity)}', ${googleAdsDaily.date})::date`,
        spend: sum(googleAdsDaily.cost).mapWith(Number),
        revenue: sql<number>`sum(${googleAdsDaily.conversionValue} * 100)::int`.mapWith(Number),
      })
      .from(googleAdsDaily)
      .where(adsDateRange)
      .groupBy(
        sql`date_trunc('${sql.raw(granularity)}', ${googleAdsDaily.date})::date`,
      ),
  ]);

  const bucketKeys = generateBucketKeys(from, to, granularity);
  type ChannelBucket = { spend: number; revenue: number };
  const fbMap = new Map<string, ChannelBucket>();
  const igMap = new Map<string, ChannelBucket>();
  const googleMap = new Map<string, ChannelBucket>();

  for (const row of metaByPlatformBucket) {
    const key = dateToBucketKey(new Date(row.bucket as string), granularity);
    const p = (row.platform ?? "").toLowerCase();
    const map = p === "facebook" ? fbMap : p === "instagram" ? igMap : null;
    if (map) {
      const prev = map.get(key) ?? { spend: 0, revenue: 0 };
      map.set(key, {
        spend: prev.spend + (row.spend ?? 0),
        revenue: prev.revenue + (row.revenue ?? 0),
      });
    } else {
      // Lump threads/AN/messenger into FB for chart simplicity
      const prev = fbMap.get(key) ?? { spend: 0, revenue: 0 };
      fbMap.set(key, {
        spend: prev.spend + (row.spend ?? 0),
        revenue: prev.revenue + (row.revenue ?? 0),
      });
    }
  }
  for (const row of googleByBucket) {
    const key = dateToBucketKey(new Date(row.bucket as string), granularity);
    const prev = googleMap.get(key) ?? { spend: 0, revenue: 0 };
    googleMap.set(key, {
      spend: prev.spend + (row.spend ?? 0),
      revenue: prev.revenue + (row.revenue ?? 0),
    });
  }

  const adSpendRoasData = bucketKeys.map((key) => {
    const fb = fbMap.get(key) ?? { spend: 0, revenue: 0 };
    const ig = igMap.get(key) ?? { spend: 0, revenue: 0 };
    const google = googleMap.get(key) ?? { spend: 0, revenue: 0 };
    return {
      bucket: key,
      label: formatBucketLabel(key, granularity),
      fbSpend: fb.spend,
      igSpend: ig.spend,
      googleSpend: google.spend,
      fbRoas: fb.spend > 0 ? fb.revenue / fb.spend : 0,
      igRoas: ig.spend > 0 ? ig.revenue / ig.spend : 0,
      googleRoas: google.spend > 0 ? google.revenue / google.spend : 0,
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
          <CardTitle>Ad Spend & ROAS by Channel</CardTitle>
        </CardHeader>
        <CardContent>
          <AdSpendRoasChart data={adSpendRoasData} />
        </CardContent>
      </Card>

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
                revenue: totalRevenueCents,
                roas: blendedRoas,
                roasBadge: <RoasBadge revenue={totalRevenueCents} spend={totalSpend} clicks={totalClicks} />,
              }}
            />
          )}
        </CardContent>
      </Card>

    </div>
  );
}

/* ── Inline components ──────────────────────────────────────────── */

type Classification = "winner" | "promising" | "underperforming" | "insufficient";

const CLASSIFICATIONS: {
  cls: Classification;
  label: string;
  style: string;
  desc: string;
}[] = [
  { cls: "winner", label: "Winner", style: "bg-emerald-600 text-white", desc: "ROAS ≥ 1.5x — profitable" },
  { cls: "promising", label: "Promising", style: "bg-blue-600 text-white", desc: "ROAS ≥ 0.5x — approaching profitability" },
  { cls: "underperforming", label: "Underperforming", style: "bg-amber-500 text-white", desc: "ROAS < 0.5x — needs optimization" },
  { cls: "insufficient", label: "Low Data", style: "bg-zinc-300 text-zinc-600", desc: "< 100 clicks — not enough data" },
];

function classify(revenue: number, spend: number, clicks: number): Classification {
  if (clicks < 100) return "insufficient";
  if (spend === 0) return "insufficient";
  const r = revenue / spend;
  if (r >= 1.5) return "winner";
  if (r >= 0.5) return "promising";
  return "underperforming";
}

function ClassificationBadge({ revenue, spend, clicks }: { revenue: number; spend: number; clicks: number }) {
  const cls = classify(revenue, spend, clicks);
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

function RoasBadge({ revenue, spend, clicks }: { revenue: number; spend: number; clicks: number }) {
  if (spend === 0 || clicks < 100) return <span className="text-zinc-300">&mdash;</span>;
  const r = revenue / spend;
  const cls = classify(revenue, spend, clicks);
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
    search: "bg-amber-500 text-white",
    display: "bg-amber-600 text-white",
    youtube: "bg-red-600 text-white",
    shopping: "bg-green-600 text-white",
  };
  const labels: Record<string, string> = {
    facebook: "FB",
    instagram: "IG",
    threads: "Threads",
    audience_network: "Audience Net",
    messenger: "Messenger",
    google: "Google",
    search: "Google Search",
    display: "Google Display",
    youtube: "YouTube",
    shopping: "Google Shopping",
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
