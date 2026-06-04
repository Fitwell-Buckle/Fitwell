import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  order,
  customer,
  ga4Daily,
  googleAdsDaily,
  gscDaily,
  metaAdsDaily,
  posthogDaily,
} from "@/lib/schema";
import { max } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { SyncJobRunner } from "./sync-job-runner";

export const metadata: Metadata = {
  title: "Data Sync | Fitwell Admin",
};

function timeAgo(date: Date | null): string {
  if (!date) return "never";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface Job {
  id: string;
  name: string;
  description: string;
  schedule: string;
  cron: string;
  path: string;
  status: "active" | "blocked" | "deferred";
  note?: string;
  lastRun?: string;
  supportsDateRange?: boolean;
}

const STATUS_STYLES = {
  active: "bg-emerald-50 text-emerald-700",
  blocked: "bg-amber-50 text-amber-700",
  deferred: "bg-zinc-100 text-zinc-500",
};

export default async function DataSyncPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const [
    lastOrder,
    lastCustomer,
    lastGa4,
    lastGoogleAds,
    lastGsc,
    lastMeta,
    lastPosthog,
  ] = await Promise.all([
    db.select({ latest: max(order.updatedAt) }).from(order),
    db.select({ latest: max(customer.updatedAt) }).from(customer),
    db.select({ latest: max(ga4Daily.date) }).from(ga4Daily),
    db.select({ latest: max(googleAdsDaily.date) }).from(googleAdsDaily),
    db.select({ latest: max(gscDaily.date) }).from(gscDaily),
    db.select({ latest: max(metaAdsDaily.date) }).from(metaAdsDaily),
    db.select({ latest: max(posthogDaily.date) }).from(posthogDaily),
  ]);

  const shopifyLastRun = [
    lastOrder[0]?.latest,
    lastCustomer[0]?.latest,
  ]
    .filter(Boolean)
    .sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;

  const jobs: Job[] = [
    {
      id: "extract-shopify",
      name: "Shopify Sync",
      description: "Orders, customers, and line items from Shopify",
      schedule: "Every 2 hours (:15 past)",
      cron: "15 */2 * * *",
      path: "/api/cron/extract-shopify",
      status: "active",
      supportsDateRange: true,
      lastRun: timeAgo(shopifyLastRun),
    },
    {
      id: "extract-ga4",
      name: "GA4 Traffic",
      description: "Sessions, users, pageviews by source/medium",
      schedule: "Daily at 6:30 AM UTC",
      cron: "30 6 * * *",
      path: "/api/cron/extract-ga4",
      status: "active",
      supportsDateRange: true,
      lastRun: timeAgo(lastGa4[0]?.latest ?? null),
    },
    {
      id: "extract-google-ads",
      name: "Google Ads",
      description:
        "Campaign impressions, clicks, cost, conversions + ad-group impression share",
      schedule: "Daily at 6:45 AM UTC",
      cron: "45 6 * * *",
      path: "/api/cron/extract-google-ads",
      status: "active",
      supportsDateRange: true,
      lastRun: timeAgo(lastGoogleAds[0]?.latest ?? null),
    },
    {
      id: "extract-gsc",
      name: "Google Search Console",
      description: "Search queries, impressions, clicks, rankings",
      schedule: "Daily at 7:00 AM UTC",
      cron: "0 7 * * *",
      path: "/api/cron/extract-gsc",
      status: "blocked",
      note: "Blocked by Google service account UI bug",
      supportsDateRange: true,
      lastRun: timeAgo(lastGsc[0]?.latest ?? null),
    },
    {
      id: "extract-meta-ads",
      name: "Meta Ads",
      description:
        "Campaign impressions, clicks, spend, conversions, ROAS + delivery rankings & audience size",
      schedule: "Daily at 7:15 AM UTC",
      cron: "15 7 * * *",
      path: "/api/cron/extract-meta-ads",
      status: "active",
      supportsDateRange: true,
      lastRun: timeAgo(lastMeta[0]?.latest ?? null),
    },
    {
      id: "extract-posthog",
      name: "PostHog Events",
      description:
        "Daily event rollups (pageviews, product views, cart adds, checkouts, purchases) into posthog_daily — feeds the funnel + attribution dashboards",
      schedule: "Every 3 hours",
      cron: "0 */3 * * *",
      path: "/api/cron/extract-posthog",
      status: "active",
      supportsDateRange: true,
      lastRun: timeAgo(lastPosthog[0]?.latest ?? null),
    },
    {
      id: "health",
      name: "Health Check",
      description: "Database connectivity and API status",
      schedule: "Every 4 hours",
      cron: "0 */4 * * *",
      path: "/api/cron/health",
      status: "active",
    },
  ];

  return (
    <div>
      <PageHeader title="Data Sync" />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Background Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-6 text-sm text-zinc-500">
            These jobs run automatically on Vercel in production. Use the
            Run button to trigger them manually against your local database.
          </p>

          <div className="space-y-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200/80 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <p className="font-medium text-zinc-900">{job.name}</p>
                    <Badge className={STATUS_STYLES[job.status]}>
                      {job.status}
                    </Badge>
                    {job.lastRun && (
                      <span className="text-[11px] text-zinc-400">
                        Last data: {job.lastRun}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-zinc-500">
                    {job.description}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    {job.schedule}
                    <span className="ml-2 font-mono text-zinc-300">({job.cron})</span>
                  </p>
                  {job.note && (
                    <p className="mt-1 text-xs text-amber-600">{job.note}</p>
                  )}
                </div>
                <SyncJobRunner
                  path={job.path}
                  disabled={job.status !== "active"}
                  supportsDateRange={job.supportsDateRange}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Real-Time Sync</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border border-zinc-200/80 px-5 py-4">
            <div>
              <div className="flex items-center gap-3">
                <p className="font-medium text-zinc-900">Shopify Webhooks</p>
                <Badge className="bg-emerald-50 text-emerald-700">
                  registered
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-zinc-500">
                orders/*, customers/*, refunds/create, products/* and
                collections/* (the last two refresh the catalog cache)
              </p>
              <p className="mt-1 font-mono text-[11px] text-zinc-400">
                → admin.fitwellbuckle.co/api/webhooks/shopify
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
