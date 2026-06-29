// Freshness monitoring for the analytics extract pipelines.
//
// Background: GA4, Google Ads, Meta and GSC extracts each broke silently in
// mid-2026 (GA4 ~05-22, Google Ads v20 block ~06-16, GSC never configured) and
// nobody noticed for weeks because the health cron only checked DB + Shopify.
// This module lets the health cron flag a pipeline whose newest row is older
// than its expected cadence allows.
//
// The evaluation is a pure function (testable without a DB); the health route
// supplies the latest row date per pipeline and the current time.

export interface PipelineSpec {
  /** key in the health response + the source table */
  key: string;
  /** human label for alerts */
  label: string;
  /**
   * Max age (hours) of the newest row before the pipeline is considered stale.
   * Sized to cadence + the data's own reporting lag, with headroom so a healthy
   * pipeline never flaps between cron runs:
   *  - daily extracts fetch *yesterday*, so the newest row is already 24-55h old
   *    when healthy → 72h threshold.
   *  - GSC fetches *today-3* (Search Console's 2-3 day lag), so its newest row is
   *    ~72-102h old when healthy → 144h threshold.
   */
  maxAgeHours: number;
  /**
   * Whether this pipeline is expected to be live right now. A pipeline that is
   * known-not-yet-configured (GSC, until its setup work plan is done) is still
   * reported, but does not flip overall health to degraded or fire an alert —
   * that would be permanent known-noise. Flip to true once it's stood up.
   */
  expectLive: boolean;
}

// Order matters only for display. Thresholds explained on `maxAgeHours` above.
export const PIPELINE_SPECS: PipelineSpec[] = [
  { key: "ga4_daily", label: "GA4 traffic", maxAgeHours: 72, expectLive: true },
  { key: "google_ads_daily", label: "Google Ads", maxAgeHours: 72, expectLive: true },
  { key: "meta_ads_daily", label: "Meta Ads", maxAgeHours: 72, expectLive: true },
  { key: "posthog_daily", label: "PostHog events", maxAgeHours: 72, expectLive: true },
  // GSC stood up 2026-06-29 (API enabled, property verified, SA granted,
  // GSC_SITE_URL set, history backfilled). 144h threshold covers its 2-3 day
  // reporting lag.
  { key: "gsc_daily", label: "Search Console", maxAgeHours: 144, expectLive: true },
];

export interface PipelineFreshness {
  key: string;
  label: string;
  lastDate: string | null;
  ageHours: number | null;
  maxAgeHours: number;
  expectLive: boolean;
  /** fresh = has a row and it's within the age threshold */
  fresh: boolean;
}

/**
 * Evaluate each pipeline's freshness from its newest row date.
 *
 * @param lastDates  key → newest row date (or null if the table is empty)
 * @param now        current time
 * @param specs      pipeline specs (override for tests)
 */
export function evaluatePipelineFreshness(
  lastDates: Record<string, Date | null>,
  now: Date,
  specs: PipelineSpec[] = PIPELINE_SPECS,
): PipelineFreshness[] {
  return specs.map((spec) => {
    const last = lastDates[spec.key] ?? null;
    const ageHours =
      last === null ? null : (now.getTime() - last.getTime()) / 3_600_000;
    const fresh = ageHours !== null && ageHours <= spec.maxAgeHours;
    return {
      key: spec.key,
      label: spec.label,
      lastDate: last === null ? null : last.toISOString(),
      ageHours: ageHours === null ? null : Math.round(ageHours),
      maxAgeHours: spec.maxAgeHours,
      expectLive: spec.expectLive,
      fresh,
    };
  });
}

/**
 * Pipelines that should be live but aren't fresh. These drive the degraded
 * status and the alert. Known-not-configured pipelines (expectLive=false) are
 * excluded so they don't generate permanent noise.
 */
export function stalePipelines(
  freshness: PipelineFreshness[],
): PipelineFreshness[] {
  return freshness.filter((f) => f.expectLive && !f.fresh);
}
