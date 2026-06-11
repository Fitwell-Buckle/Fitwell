// Pure (db-free) logic for the positive-control stage check-ins. A line in a
// stage has an estimated duration; we prompt the supplier at each threshold %
// of that window to confirm they're on track. Silence (or a flagged delay, or
// overrun without a confirmation) escalates to admins.

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type CheckinStatus = "pending" | "on_track" | "at_risk";

/** How far (%) into a stage's estimated window we are. >=100 = overran. */
export function elapsedPct(
  enteredMs: number,
  estimateDays: number,
  nowMs: number,
): number {
  if (estimateDays <= 0) return 0;
  return ((nowMs - enteredMs) / (estimateDays * MS_PER_DAY)) * 100;
}

/**
 * Thresholds the stage has now crossed (elapsed% >= threshold) that haven't
 * been prompted yet — i.e. the check-ins to send this run.
 */
export function dueThresholds(
  pct: number,
  thresholds: number[],
  alreadySent: number[],
): number[] {
  const sent = new Set(alreadySent);
  return thresholds
    .filter((t) => pct >= t && !sent.has(t))
    .sort((a, b) => a - b);
}

/**
 * Positive-control escalation for a stage instance, given the statuses of the
 * check-ins already prompted for it. Escalate when the supplier flagged a
 * delay, or the stage has overrun its estimate with no on-track confirmation
 * (they were prompted and never affirmed). An on-track confirmation suppresses
 * the overrun escalation.
 */
export function shouldEscalate(
  statuses: CheckinStatus[],
  pct: number,
): boolean {
  if (statuses.includes("at_risk")) return true;
  if (pct >= 100 && !statuses.includes("on_track")) return true;
  return false;
}
