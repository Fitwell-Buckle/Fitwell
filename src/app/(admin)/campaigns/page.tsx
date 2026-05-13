import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ga4Daily, googleAdsDaily } from "@/lib/schema";
import { sql, desc, sum, count, and, gte, lte } from "drizzle-orm";
import { parseDateRange } from "@/lib/date-range";
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
  const { from, to } = parseDateRange(params);

  const ga4DateRange = and(gte(ga4Daily.date, from), lte(ga4Daily.date, to));
  const adsDateRange = and(
    gte(googleAdsDaily.date, from),
    lte(googleAdsDaily.date, to),
  );

  const [trafficBySource, totalTraffic, adCampaigns] = await Promise.all([
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
  ]);

  const totals = totalTraffic[0] ?? {
    sessions: 0,
    users: 0,
    pageviews: 0,
    days: 0,
  };

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
      </div>
    </div>
  );
}
