/**
 * Single source of truth for the store's operating timezone.
 *
 * All "day" boundaries — the Today filter, date-range filtering, and daily
 * chart buckets — are computed in this zone so the admin dashboard reconciles
 * with Shopify's reports, which bucket by the *store* day, not UTC. Stored
 * timestamps stay in UTC; only the calendar-day math is zoned.
 *
 * Why this matters: a sale placed at 6pm Pacific is `01:00Z` the *next* day. If
 * "Today" is computed in UTC, an evening-Pacific viewer sees an almost-empty
 * next-UTC-day window — which is exactly the "$0 today" bug this fixes.
 */
export const STORE_TZ = "America/Los_Angeles";

/** `YYYY-MM-DD` for an instant, as seen on the wall clock in the store tz. */
export function formatInStoreTz(date: Date): string {
  // en-CA formats as ISO-style YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Today's calendar date (`YYYY-MM-DD`) in the store tz. */
export function storeToday(now: Date = new Date()): string {
  return formatInStoreTz(now);
}

/** Shift a `YYYY-MM-DD` calendar date by whole days. Timezone-agnostic. */
export function shiftDate(ymd: string, deltaDays: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/** How far ahead the store wall clock is vs UTC at `date`, in ms (negative for the US). */
function storeOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STORE_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24, // some engines render midnight as "24"
    get("minute"),
    get("second"),
  );
  return asUtc - date.getTime();
}

/**
 * UTC instant for the START of a store-local calendar day (00:00:00.000 store
 * time). Midnight is never inside the DST-ambiguous hour for US zones, so the
 * single-offset evaluation here is exact.
 */
export function storeDayStartUtc(ymd: string): Date {
  const naive = new Date(`${ymd}T00:00:00Z`);
  return new Date(naive.getTime() - storeOffsetMs(naive));
}

/** UTC instant for the END of a store-local calendar day (23:59:59.999 store time). */
export function storeDayEndUtc(ymd: string): Date {
  return new Date(storeDayStartUtc(ymd).getTime() + 24 * 60 * 60 * 1000 - 1);
}
