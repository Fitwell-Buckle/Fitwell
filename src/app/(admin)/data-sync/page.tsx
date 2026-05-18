import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { SyncJobRunner } from "./sync-job-runner";

export const metadata: Metadata = {
  title: "Data Sync | Fitwell Admin",
};

const JOBS = [
  {
    id: "extract-shopify",
    name: "Shopify Sync",
    description: "Orders, customers, and line items from Shopify",
    schedule: "Every 2 hours (:15 past)",
    cron: "15 */2 * * *",
    path: "/api/cron/extract-shopify",
    status: "active" as const,
  },
  {
    id: "extract-ga4",
    name: "GA4 Traffic",
    description: "Sessions, users, pageviews by source/medium",
    schedule: "Daily at 6:30 AM UTC",
    cron: "30 6 * * *",
    path: "/api/cron/extract-ga4",
    status: "active" as const,
  },
  {
    id: "extract-google-ads",
    name: "Google Ads",
    description: "Campaign impressions, clicks, cost, conversions",
    schedule: "Daily at 6:45 AM UTC",
    cron: "45 6 * * *",
    path: "/api/cron/extract-google-ads",
    status: "blocked" as const,
    note: "Pending Basic API access approval",
  },
  {
    id: "extract-gsc",
    name: "Google Search Console",
    description: "Search queries, impressions, clicks, rankings",
    schedule: "Daily at 7:00 AM UTC",
    cron: "0 7 * * *",
    path: "/api/cron/extract-gsc",
    status: "blocked" as const,
    note: "Blocked by Google service account UI bug",
  },
  {
    id: "extract-meta-ads",
    name: "Meta Ads",
    description: "Campaign impressions, clicks, spend, conversions, ROAS",
    schedule: "Daily at 7:15 AM UTC",
    cron: "15 7 * * *",
    path: "/api/cron/extract-meta-ads",
    status: "active" as const,
  },
  {
    id: "extract-posthog",
    name: "PostHog Events",
    description: "Event rollups for landing page analytics",
    schedule: "Every 3 hours",
    cron: "0 */3 * * *",
    path: "/api/cron/extract-posthog",
    status: "deferred" as const,
    note: "Not configured — deferred until landing pages are built",
  },
  {
    id: "health",
    name: "Health Check",
    description: "Database connectivity and API status",
    schedule: "Every 4 hours",
    cron: "0 */4 * * *",
    path: "/api/cron/health",
    status: "active" as const,
  },
];

const STATUS_STYLES = {
  active: "bg-emerald-50 text-emerald-700",
  blocked: "bg-amber-50 text-amber-700",
  deferred: "bg-zinc-100 text-zinc-500",
};

export default async function DataSyncPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

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
            {JOBS.map((job) => (
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
                  </div>
                  <p className="mt-0.5 text-sm text-zinc-500">
                    {job.description}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-zinc-400">
                    {job.schedule}
                    <span className="ml-2 text-zinc-300">({job.cron})</span>
                  </p>
                  {job.note && (
                    <p className="mt-1 text-xs text-amber-600">{job.note}</p>
                  )}
                </div>
                <SyncJobRunner path={job.path} disabled={job.status !== "active"} />
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
              <p className="font-medium text-zinc-900">Shopify Webhooks</p>
              <p className="mt-0.5 text-sm text-zinc-500">
                orders/create, orders/updated, customers/create,
                customers/update
              </p>
              <p className="mt-1 font-mono text-[11px] text-zinc-400">
                → admin.fitwellbuckle.co/api/webhooks/shopify
              </p>
            </div>
            <Badge className="bg-emerald-50 text-emerald-700">
              registered
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
