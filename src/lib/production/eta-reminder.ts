// Pure cadence logic for the supplier ETA-reminder cron — kept db-free so it's
// unit-testable.

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whether a supplier is due for another ETA reminder: never reminded (null), or
 * at least `intervalDays` have elapsed since the last one. The cron runs daily
 * and uses this per-supplier, so the cadence is driven by the configurable
 * interval, not the cron schedule.
 */
export function isReminderDue(
  lastSentAt: Date | null | undefined,
  intervalDays: number,
  nowMs: number,
): boolean {
  const last = lastSentAt?.getTime() ?? 0;
  return nowMs - last >= intervalDays * MS_PER_DAY;
}
