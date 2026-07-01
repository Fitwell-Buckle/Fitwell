/**
 * Freshness of the shipping-cost data. Drives the weekly "upload this week's
 * billing CSV" prompt — staleness is measured from the most recent import, so
 * the moment Tom uploads, the prompt goes away until next week.
 *
 * This file is PURE (no db import) so the client ShippingCostReminder banner can
 * import isShippingImportStale without pulling `@/lib/db` into the browser bundle.
 * The db query lives in import-status-query.ts.
 */

/** How old the shipping-cost data may get before we nag (days). */
export const SHIPPING_IMPORT_STALE_DAYS = 7;

/**
 * Who sees the weekly upload nag. Tom owns exporting the bill, so it's just him
 * by default — others can still upload via the button on /cogs, they just aren't
 * nagged. Override with the SHIPPING_REMINDER_EMAILS env var (comma-separated)
 * without a code change.
 */
export const SHIPPING_REMINDER_EMAILS = (
  process.env.SHIPPING_REMINDER_EMAILS ?? "tom@fitwellbuckle.co"
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function shouldSeeShippingReminder(email: string | null | undefined): boolean {
  if (!email) return false;
  return SHIPPING_REMINDER_EMAILS.includes(email.toLowerCase());
}

/** Whole days between two dates (null date → null). Pure, for testing. */
export function daysSince(date: Date | null, now: Date): number | null {
  if (!date) return null;
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

/** True when the data is missing or older than the stale window. */
export function isShippingImportStale(
  daysOld: number | null,
  staleDays = SHIPPING_IMPORT_STALE_DAYS,
): boolean {
  return daysOld === null || daysOld >= staleDays;
}

export interface ShippingImportStatus {
  /** When the most recent shipping charge was imported, or null if none yet. */
  lastImportedAt: Date | null;
  totalCharges: number;
}

// getShippingImportStatus (the db query) moved to import-status-query.ts to keep
// this module pure for the client banner.
