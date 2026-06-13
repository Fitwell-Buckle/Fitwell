/**
 * Idempotency guard for the daily run.
 *
 * The newsletter has two production triggers that share the same `-auto`
 * slug (see specs/current/newsletter-engine.md → "Idempotency & the dual
 * trigger"): a Vercel cron that fires the workflow at ~08:55 UTC (the
 * primary send) and GitHub's own `schedule:` cron at 10:00 UTC (a
 * fallback in case the primary never ran). Once the primary has sent,
 * the fallback must be a COMPLETE no-op — it must not run the editorial
 * pipeline and, critically, must not persist any freshly-fetched stories
 * to `newsletter_article`. Persisting marks them "seen", so a late-
 * breaking story the fallback discovers would be recorded as seen yet
 * never emailed (it can't be — the campaign already sent), and tomorrow's
 * dedup would suppress it. That is the swallowed-stories bug this guard
 * exists to prevent.
 */
import type { KlaviyoClient } from "../src/lib/klaviyo/client";

/**
 * Has today's slug already gone out? Mirrors the status check in
 * draftCampaign: anything that is not a draft means the issue is locked
 * (sent / sending / scheduled), so a second run must back off. A missing
 * campaign (null) means nothing has been created yet — proceed.
 */
export function isAlreadySent(
  existing: { status: string } | null,
): boolean {
  if (!existing) return false;
  return existing.status.toLowerCase() !== "draft";
}

/**
 * Klaviyo-backed wrapper around {@link isAlreadySent}. Fails soft: if the
 * lookup itself errors (transient Klaviyo hiccup), returns false so a
 * legitimate send is never blocked — draftCampaign's own
 * CampaignAlreadySentError remains the backstop against a double-send.
 */
export async function campaignAlreadySent(
  slug: string,
  client: KlaviyoClient,
): Promise<boolean> {
  try {
    return isAlreadySent(await client.getCampaignByName(slug));
  } catch (e) {
    console.warn(
      `idempotency pre-check failed for "${slug}" (proceeding): ${e instanceof Error ? e.message : e}`,
    );
    return false;
  }
}
