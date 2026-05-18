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

  const [
    trafficBySource,
    totalTraffic,
    adCampaigns,
    metaCampaigns,
    metaAttributedOrders,
    googleAttributedOrders,
    metaByLandingPage,
    googleByLandingPage,
  ] = await Promise.all([
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

    // Meta-attributed orders from Shopify
    db
      .select({
        orders: count(),
        revenue: sum(order.totalPrice).mapWith(Number),
      })
      .from(order)
      .where(
        and(
          gte(order.processedAt, from),
          lte(order.processedAt, to),
          sql`${order.financialStatus} IN ('paid', 'partially_refunded')`,
          sql`${order.sourceName} = 'web'`,
          sql`(${order.landingSite} ILIKE '%utm_source=meta%' OR ${order.landingSite} ILIKE '%utm_source=ig%' OR ${order.landingSite} ILIKE '%utm_source=fb%' OR ${order.landingSite} ILIKE '%utm_source=instagram%' OR ${order.referringSite} ILIKE '%facebook.com%' OR ${order.referringSite} ILIKE '%instagram.com%')`,
        ),
      ),

    // Google-attributed orders from Shopify
    db
      .select({
        orders: count(),
        revenue: sum(order.totalPrice).mapWith(Number),
      })
      .from(order)
      .where(
        and(
          gte(order.processedAt, from),
          lte(order.processedAt, to),
          sql`${order.financialStatus} IN ('paid', 'partially_refunded')`,
          sql`${order.sourceName} = 'web'`,
          sql`(${order.landingSite} ILIKE '%gad_source%' OR ${order.landingSite} ILIKE '%gclid%' OR ${order.landingSite} ILIKE '%utm_source=google%')`,
        ),
      ),

    // Meta-attributed orders by landing page + UTM campaign
    db
      .select({
        landingPage: sql<string>`split_part(${order.landingSite}, '?', 1)`,
        utmCampaign: sql<string>`substring(${order.landingSite} from 'utm_campaign=([^&]+)')`,
        orders: count(),
        revenue: sum(order.totalPrice).mapWith(Number),
      })
      .from(order)
      .where(
        and(
          gte(order.processedAt, from),
          lte(order.processedAt, to),
          sql`${order.financialStatus} IN ('paid', 'partially_refunded')`,
          sql`${order.sourceName} = 'web'`,
          sql`(${order.landingSite} ILIKE '%utm_source=meta%' OR ${order.landingSite} ILIKE '%utm_source=ig%' OR ${order.landingSite} ILIKE '%utm_source=fb%' OR ${order.landingSite} ILIKE '%utm_source=instagram%' OR ${order.referringSite} ILIKE '%facebook.com%' OR ${order.referringSite} ILIKE '%instagram.com%')`,
        ),
      )
      .groupBy(
        sql`split_part(${order.landingSite}, '?', 1)`,
        sql`substring(${order.landingSite} from 'utm_campaign=([^&]+)')`,
      )
      .orderBy(desc(count()))
      .limit(20),

    // Google-attributed orders by landing page
    db
      .select({
        landingPage: sql<string>`split_part(${order.landingSite}, '?', 1)`,
        utmCampaign: sql<string>`substring(${order.landingSite} from 'utm_campaign=([^&]+)')`,
        orders: count(),
        revenue: sum(order.totalPrice).mapWith(Number),
      })
      .from(order)
      .where(
        and(
          gte(order.processedAt, from),
          lte(order.processedAt, to),
          sql`${order.financialStatus} IN ('paid', 'partially_refunded')`,
          sql`${order.sourceName} = 'web'`,
          sql`(${order.landingSite} ILIKE '%gad_source%' OR ${order.landingSite} ILIKE '%gclid%' OR ${order.landingSite} ILIKE '%utm_source=google%')`,
        ),
      )
      .groupBy(
        sql`split_part(${order.landingSite}, '?', 1)`,
        sql`substring(${order.landingSite} from 'utm_campaign=([^&]+)')`,
      )
      .orderBy(desc(count()))
      .limit(20),
  ]);

  const totals = totalTraffic[0] ?? {
    sessions: 0,
    users: 0,
    pageviews: 0,
    days: 0,
  };

  // ── Summary metrics ────────────────────────────────────────────────
  const totalMetaSpend = metaCampaigns.reduce((s, r) => s + (r.cost ?? 0), 0);
  const totalGoogleSpend = adCampaigns.reduce((s, r) => s + (r.cost ?? 0), 0);
  const totalSpend = totalMetaSpend + totalGoogleSpend;
  const totalMetaClicks = metaCampaigns.reduce(
    (s, r) => s + (r.clicks ?? 0),
    0,
  );
  const totalGoogleClicks = adCampaigns.reduce(
    (s, r) => s + (r.clicks ?? 0),
    0,
  );
  const totalClicks = totalMetaClicks + totalGoogleClicks;
  const metaRevenue = metaAttributedOrders[0]?.revenue ?? 0;
  const googleRevenue = googleAttributedOrders[0]?.revenue ?? 0;
  const totalAttributedRevenue = metaRevenue + googleRevenue;
  const blendedRoas = totalSpend > 0 ? totalAttributedRevenue / totalSpend : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

  // ── Build unified campaign paths ──────────────────────────────────
  interface CampaignPath {
    platform: "meta" | "google";
    kind: "campaign" | "landing-page";
    campaignName: string;
    landingPage: string | null;
    utmCampaign: string | null;
    impressions: number;
    clicks: number;
    spend: number; // cents
    orders: number;
    revenue: number; // cents
  }

  const paths: CampaignPath[] = [];

  // Meta campaign-level rows
  for (const row of metaCampaigns) {
    const cost = row.cost ?? 0;
    const matchingPages = metaByLandingPage.filter((lp) => {
      if (!lp.utmCampaign || !row.campaignName) return false;
      const decoded = decodeURIComponent(lp.utmCampaign).toLowerCase();
      const name = row.campaignName.toLowerCase();
      return decoded === name || decoded.includes(name) || name.includes(decoded);
    });
    const lpOrders = matchingPages.reduce((s, lp) => s + (lp.orders ?? 0), 0);
    const lpRevenue = matchingPages.reduce((s, lp) => s + (lp.revenue ?? 0), 0);
    paths.push({
      platform: "meta",
      kind: "campaign",
      campaignName: row.campaignName ?? "—",
      landingPage: null,
      utmCampaign: null,
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      spend: cost,
      orders: lpOrders,
      revenue: lpRevenue,
    });
  }

  // Meta landing page rows
  for (const lp of metaByLandingPage) {
    paths.push({
      platform: "meta",
      kind: "landing-page",
      campaignName: "",
      landingPage: lp.landingPage ?? null,
      utmCampaign: lp.utmCampaign ? decodeURIComponent(lp.utmCampaign) : null,
      impressions: 0,
      clicks: 0,
      spend: 0,
      orders: lp.orders ?? 0,
      revenue: lp.revenue ?? 0,
    });
  }

  // Google campaign-level rows
  for (const row of adCampaigns) {
    const cost = row.cost ?? 0;
    const matchingPages = googleByLandingPage.filter((lp) => {
      if (!lp.utmCampaign || !row.campaignName) return false;
      const decoded = decodeURIComponent(lp.utmCampaign).toLowerCase();
      const name = row.campaignName.toLowerCase();
      return decoded === name || decoded.includes(name) || name.includes(decoded);
    });
    const lpOrders = matchingPages.reduce((s, lp) => s + (lp.orders ?? 0), 0);
    const lpRevenue = matchingPages.reduce((s, lp) => s + (lp.revenue ?? 0), 0);
    paths.push({
      platform: "google",
      kind: "campaign",
      campaignName: row.campaignName ?? "—",
      landingPage: null,
      utmCampaign: null,
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      spend: cost,
      orders: lpOrders,
      revenue: lpRevenue,
    });
  }

  // Google landing page rows
  for (const lp of googleByLandingPage) {
    paths.push({
      platform: "google",
      kind: "landing-page",
      campaignName: "",
      landingPage: lp.landingPage ?? null,
      utmCampaign: lp.utmCampaign ? decodeURIComponent(lp.utmCampaign) : null,
      impressions: 0,
      clicks: 0,
      spend: 0,
      orders: lp.orders ?? 0,
      revenue: lp.revenue ?? 0,
    });
  }

  const metaPaths = paths.filter((p) => p.platform === "meta");
  const googlePaths = paths.filter((p) => p.platform === "google");
  const totalImpressions =
    paths.reduce((s, p) => s + p.impressions, 0);
  const totalOrders = paths
    .filter((p) => p.kind === "campaign")
    .reduce((s, p) => s + p.orders, 0);
  const totalRevenue = paths
    .filter((p) => p.kind === "campaign")
    .reduce((s, p) => s + p.revenue, 0);
  const totalCtr =
    totalImpressions > 0 ? totalClicks / totalImpressions : 0;

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
        <MetricCard
          label="DTC Revenue (attributed)"
          value={fmt(totalAttributedRevenue)}
        />
        <MetricCard label="Blended ROAS" value={`${blendedRoas.toFixed(2)}x`} />
        <MetricCard label="Avg CPC" value={fmt(avgCpc)} />
      </div>

      {/* ── Unified Campaign Performance Table ───────────────────── */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Campaign Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {paths.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">
              No campaign data for this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 min-w-[280px] bg-white">
                    Path
                  </TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">CPC</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* ── Meta Section ── */}
                {metaPaths.length > 0 && (
                  <>
                    <TableRow className="border-b-0 hover:bg-transparent">
                      <TableCell
                        colSpan={9}
                        className="pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-400"
                      >
                        Meta Ads
                      </TableCell>
                    </TableRow>
                    {metaPaths.map((row, i) => {
                      const isCampaign = row.kind === "campaign";
                      const ctr =
                        row.impressions > 0
                          ? row.clicks / row.impressions
                          : 0;
                      const cpc =
                        row.clicks > 0 ? row.spend / row.clicks : 0;
                      return (
                        <TableRow
                          key={`meta-${i}`}
                          className={
                            isCampaign ? "" : "border-b-zinc-50 bg-zinc-50/30"
                          }
                        >
                          <TableCell className="sticky left-0 bg-inherit">
                            {isCampaign ? (
                              <div className="flex items-center gap-2">
                                <PlatformBadge platform="meta" />
                                <span className="font-medium text-zinc-900">
                                  {row.campaignName}
                                </span>
                              </div>
                            ) : (
                              <div className="pl-7">
                                <span className="font-mono text-xs text-zinc-500">
                                  {row.landingPage ?? "—"}
                                </span>
                                {row.utmCampaign && (
                                  <span className="ml-2 text-[11px] text-zinc-400">
                                    {row.utmCampaign}
                                  </span>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {isCampaign ? (
                              <Mono>{row.impressions.toLocaleString()}</Mono>
                            ) : (
                              <span className="text-zinc-300">&mdash;</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {isCampaign ? (
                              <Mono>{row.clicks.toLocaleString()}</Mono>
                            ) : (
                              <span className="text-zinc-300">&mdash;</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {isCampaign ? (
                              <span className="font-mono text-zinc-500">
                                {pct(ctr)}
                              </span>
                            ) : (
                              <span className="text-zinc-300">&mdash;</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {isCampaign ? (
                              <Mono>{fmt(row.spend)}</Mono>
                            ) : (
                              <span className="text-zinc-300">&mdash;</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {isCampaign ? (
                              <span className="font-mono text-zinc-500">
                                {fmt(cpc)}
                              </span>
                            ) : (
                              <span className="text-zinc-300">&mdash;</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Mono>{row.orders}</Mono>
                          </TableCell>
                          <TableCell className="text-right">
                            <Mono>{fmt(row.revenue)}</Mono>
                          </TableCell>
                          <TableCell className="text-right">
                            {isCampaign ? (
                              <RoasBadge
                                revenue={row.revenue}
                                spend={row.spend}
                              />
                            ) : (
                              <span className="text-zinc-300">&mdash;</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </>
                )}

                {/* ── Google Section ── */}
                {googlePaths.length > 0 && (
                  <>
                    <TableRow className="border-b-0 hover:bg-transparent">
                      <TableCell
                        colSpan={9}
                        className="pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-400"
                      >
                        Google Ads
                      </TableCell>
                    </TableRow>
                    {googlePaths.map((row, i) => {
                      const isCampaign = row.kind === "campaign";
                      const ctr =
                        row.impressions > 0
                          ? row.clicks / row.impressions
                          : 0;
                      const cpc =
                        row.clicks > 0 ? row.spend / row.clicks : 0;
                      return (
                        <TableRow
                          key={`google-${i}`}
                          className={
                            isCampaign ? "" : "border-b-zinc-50 bg-zinc-50/30"
                          }
                        >
                          <TableCell className="sticky left-0 bg-inherit">
                            {isCampaign ? (
                              <div className="flex items-center gap-2">
                                <PlatformBadge platform="google" />
                                <span className="font-medium text-zinc-900">
                                  {row.campaignName}
                                </span>
                              </div>
                            ) : (
                              <div className="pl-7">
                                <span className="font-mono text-xs text-zinc-500">
                                  {row.landingPage ?? "—"}
                                </span>
                                {row.utmCampaign && (
                                  <span className="ml-2 text-[11px] text-zinc-400">
                                    {row.utmCampaign}
                                  </span>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {isCampaign ? (
                              <Mono>{row.impressions.toLocaleString()}</Mono>
                            ) : (
                              <span className="text-zinc-300">&mdash;</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {isCampaign ? (
                              <Mono>{row.clicks.toLocaleString()}</Mono>
                            ) : (
                              <span className="text-zinc-300">&mdash;</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {isCampaign ? (
                              <span className="font-mono text-zinc-500">
                                {pct(ctr)}
                              </span>
                            ) : (
                              <span className="text-zinc-300">&mdash;</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {isCampaign ? (
                              <Mono>{fmt(row.spend)}</Mono>
                            ) : (
                              <span className="text-zinc-300">&mdash;</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {isCampaign ? (
                              <span className="font-mono text-zinc-500">
                                {fmt(cpc)}
                              </span>
                            ) : (
                              <span className="text-zinc-300">&mdash;</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Mono>{row.orders}</Mono>
                          </TableCell>
                          <TableCell className="text-right">
                            <Mono>{fmt(row.revenue)}</Mono>
                          </TableCell>
                          <TableCell className="text-right">
                            {isCampaign ? (
                              <RoasBadge
                                revenue={row.revenue}
                                spend={row.spend}
                              />
                            ) : (
                              <span className="text-zinc-300">&mdash;</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </>
                )}
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
                    <Mono>{totalOrders}</Mono>
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{fmt(totalRevenue)}</Mono>
                  </TableCell>
                  <TableCell className="text-right">
                    <RoasBadge revenue={totalRevenue} spend={totalSpend} />
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
