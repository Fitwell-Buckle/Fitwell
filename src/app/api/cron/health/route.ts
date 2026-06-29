import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adminNotification,
  ga4Daily,
  googleAdsDaily,
  gscDaily,
  metaAdsDaily,
  posthogDaily,
} from "@/lib/schema";
import { verifyCronOrAdmin } from "@/lib/cron-auth";
import { createAdminNotification } from "@/lib/notifications/admin-notify";
import {
  evaluatePipelineFreshness,
  stalePipelines,
  type PipelineFreshness,
} from "@/lib/analytics/pipeline-health";

// Source table per pipeline key. Each has a `date` column holding the data day.
const PIPELINE_TABLES = {
  ga4_daily: ga4Daily,
  google_ads_daily: googleAdsDaily,
  meta_ads_daily: metaAdsDaily,
  posthog_daily: posthogDaily,
  gsc_daily: gscDaily,
} as const;

const STALE_ALERT_TYPE = "pipeline_stale";
// Health cron runs every 4h; only alert once per ~day per stale episode so a
// long-running outage doesn't spam the inbox + push every run.
const ALERT_DEDUP_HOURS = 20;

/** Newest row date per pipeline (null if the table is empty). */
async function loadPipelineFreshness(now: Date): Promise<PipelineFreshness[]> {
  const lastDates: Record<string, Date | null> = {};
  await Promise.all(
    Object.entries(PIPELINE_TABLES).map(async ([key, table]) => {
      const [row] = await db
        .select({ max: sql<Date | null>`MAX(${table.date})` })
        .from(table);
      lastDates[key] = row?.max ?? null;
    }),
  );
  return evaluatePipelineFreshness(lastDates, now);
}

export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checks: Record<string, boolean> = {};

  // Check DB connection
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = true;
  } catch {
    checks.database = false;
  }

  // Check Shopify API reachability
  try {
    const domain = process.env.SHOPIFY_STORE_DOMAIN;
    const token = process.env.SHOPIFY_ADMIN_API_TOKEN;
    if (domain && token) {
      const res = await fetch(
        `https://${domain}/admin/api/2024-10/shop.json`,
        { headers: { "X-Shopify-Access-Token": token } },
      );
      checks.shopify = res.ok;
    } else {
      checks.shopify = false;
    }
  } catch {
    checks.shopify = false;
  }

  // Check analytics pipeline freshness. A stale extract (GA4/Ads/Meta/PostHog)
  // used to fail silently for weeks — this surfaces it and alerts the team.
  let pipelines: PipelineFreshness[] = [];
  let stale: PipelineFreshness[] = [];
  try {
    pipelines = await loadPipelineFreshness(new Date());
    stale = stalePipelines(pipelines);
    checks.pipelines = stale.length === 0;

    if (stale.length > 0) {
      // Dedup: skip if we already alerted within the last ALERT_DEDUP_HOURS.
      const since = new Date(Date.now() - ALERT_DEDUP_HOURS * 3_600_000);
      const [recent] = await db
        .select({ id: adminNotification.id })
        .from(adminNotification)
        .where(
          and(
            eq(adminNotification.type, STALE_ALERT_TYPE),
            gte(adminNotification.createdAt, since),
          ),
        )
        .limit(1);

      if (!recent) {
        const lines = stale
          .map((p) =>
            p.lastDate
              ? `${p.label}: last data ${p.ageHours}h ago (limit ${p.maxAgeHours}h)`
              : `${p.label}: no data`,
          )
          .join("; ");
        await createAdminNotification({
          type: STALE_ALERT_TYPE,
          title: `${stale.length} analytics pipeline${stale.length > 1 ? "s" : ""} stale`,
          body: lines,
          href: "/data-sync",
        });
      }
    }
  } catch {
    // A failure evaluating freshness shouldn't mask DB/Shopify health.
    checks.pipelines = false;
  }

  const allHealthy = Object.values(checks).every(Boolean);

  return NextResponse.json({
    status: allHealthy ? "healthy" : "degraded",
    checks,
    pipelines,
    timestamp: new Date().toISOString(),
  });
}
