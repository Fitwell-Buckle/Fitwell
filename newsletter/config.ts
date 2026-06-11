/**
 * Newsletter identity + send configuration in one place so the eventual
 * rename (working title pending — see specs/strategy/newsletter.md →
 * Open decisions) is a one-file change.
 */

export const NEWSLETTER = {
  /** Working title — riff on Fitwell's micro-adjust positioning. */
  title: "The Daily Micro-Adjust",
  tagline: "Everything that matters in watches. In your inbox before your first meeting.",
  /**
   * Klaviyo sender identity. info@fitwellbuckle.co is Fitwell's already-
   * authenticated Klaviyo sending domain (NOT the portal.* subdomain,
   * which is Resend/transactional only and unknown to Klaviyo).
   */
  fromLabel: "The Daily Micro-Adjust",
  fromEmail: process.env.NEWSLETTER_FROM_EMAIL ?? "info@fitwellbuckle.co",
  /**
   * Klaviyo list the campaign drafts target. No default on purpose —
   * draft mode fails loudly until the list exists (decision: new
   * standalone list, opt-in; see specs/strategy/newsletter.md).
   */
  klaviyoListId: process.env.NEWSLETTER_KLAVIYO_LIST_ID,
  /** Hard cap on stories per brief — taste over completeness. */
  maxStories: 12,
  /** Only consider feed items published within this window. */
  lookbackHours: 36,
  /** utm_source for all links in the brief. */
  utmSource: "newsletter",
  /** Fitwell™ 2026 wordmark (white), trimmed to bbox — for the dark masthead. */
  logoUrl:
    "https://u7unnafmnzoxkkki.public.blob.vercel-storage.com/newsletter/fitwell-mark-white-2026.png",
  /** Fitwell™ 2026 wordmark (black), trimmed to bbox. */
  logoBlackUrl:
    "https://u7unnafmnzoxkkki.public.blob.vercel-storage.com/newsletter/fitwell-mark-black-2026.png",
  /** Fitwell™ 2026 wordmark recolored to the #c08a4d accent — for the cream sponsor module. */
  logoGoldUrl:
    "https://u7unnafmnzoxkkki.public.blob.vercel-storage.com/newsletter/fitwell-mark-gold-2026.png",
} as const;

/**
 * Campaign slug for a given send date, e.g. "micro-adjust-2026-06-10".
 * NEWSLETTER_SLUG_SUFFIX lets a test re-send use a fresh campaign name
 * (Klaviyo won't reuse/delete a campaign once it's Sent) — leave unset
 * in production.
 */
export function campaignSlug(date: Date): string {
  const suffix = process.env.NEWSLETTER_SLUG_SUFFIX ?? "";
  return `micro-adjust-${date.toISOString().slice(0, 10)}${suffix}`;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Subject line: weekday anchor + lead headline, truncated for inbox display. */
export function buildSubject(date: Date, leadTitle: string): string {
  const day = WEEKDAYS[date.getUTCDay()];
  const lead = leadTitle.length > 70 ? `${leadTitle.slice(0, 67)}…` : leadTitle;
  return `${day}: ${lead}`;
}
