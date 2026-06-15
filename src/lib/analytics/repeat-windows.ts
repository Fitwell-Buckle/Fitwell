/**
 * Repeat-purchase window math for the dashboard "Customer Value & Retention"
 * table.
 *
 * Definition (chosen 2026-06-15): we measure the repeat behaviour of customers
 * NEWLY ACQUIRED in the selected period — those whose first-ever order falls
 * inside the date range (a customer who ordered before the range and again
 * inside it does NOT count; their first purchase wasn't in the window). Of that
 * cohort, each window column reports the share who placed a 2nd order within X
 * days of their first, where that 2nd order is also inside the period.
 *
 * All columns share ONE denominator — the newly-acquired cohort — so the rates
 * are directly comparable and only rise left to right (repeated-within-30d ⊆
 * within-90d ⊆ …). The cohort is fixed (no per-window eligibility shrinking),
 * which is what makes the columns honest against each other.
 *
 * A window wider than the selected range would just duplicate the
 * "repeated anytime in the period" total (a 2nd in-period order can't be more
 * than the range span away from the first), so we show columns only up to the
 * narrowest window that covers the range; wider ones render as "—".
 */

export const REPEAT_WINDOWS = [
  { key: "d30", label: "≤30d", days: 30 },
  { key: "d90", label: "≤90d", days: 90 },
  { key: "m6", label: "≤6mo", days: 182 },
  { key: "y1", label: "≤1yr", days: 365 },
] as const;

export type RepeatWindowKey = (typeof REPEAT_WINDOWS)[number]["key"];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RepeatTiming {
  /**
   * True when this customer's first-ever order falls inside the selected range
   * (i.e. they had no order before the range start). Only these count.
   */
  newlyAcquired: boolean;
  /** First in-range order timestamp (ms) — equals the first-ever order for the cohort. */
  firstOrderMs: number | null;
  /** Second in-range order timestamp (ms), or null for one-and-done in the period. */
  secondOrderMs: number | null;
}

export interface RepeatWindowCell {
  key: RepeatWindowKey;
  label: string;
  days: number;
  /** Whether the selected range is wide enough for this window to be distinct. */
  supported: boolean;
  /**
   * Repeat rate (0–100) over the newly-acquired cohort, or null when the window
   * is wider than the range or the cohort is empty.
   */
  rate: number | null;
}

export interface RepeatWindowSummary {
  /** Shared denominator: customers newly acquired in the period. */
  cohort: number;
  cells: RepeatWindowCell[];
}

/**
 * Index of the narrowest window that fully covers the range (its days ≥ the
 * range span). Columns past it would duplicate the period total. -1 when no
 * window covers the range (range longer than the widest window) — then every
 * column is distinct and all are shown.
 */
function coveringWindowIndex(rangeDays: number): number {
  return REPEAT_WINDOWS.findIndex((w) => w.days >= rangeDays);
}

/**
 * Compute repeat-window rates for one segment over the newly-acquired cohort.
 *
 * @param timings   one entry per customer who ordered in the segment in range
 * @param rangeDays width of the selected range in days
 */
export function computeRepeatWindows(
  timings: RepeatTiming[],
  rangeDays: number,
): RepeatWindowSummary {
  let cohort = 0;
  const repeated: Record<RepeatWindowKey, number> = {
    d30: 0,
    d90: 0,
    m6: 0,
    y1: 0,
  };

  for (const t of timings) {
    if (!t.newlyAcquired || t.firstOrderMs == null) continue;
    cohort += 1;
    if (t.secondOrderMs == null) continue; // one-and-done in the period
    const gapDays = (t.secondOrderMs - t.firstOrderMs) / DAY_MS;
    for (const w of REPEAT_WINDOWS) {
      if (gapDays <= w.days) repeated[w.key] += 1;
    }
  }

  const coveringIdx = coveringWindowIndex(rangeDays);
  const cells: RepeatWindowCell[] = REPEAT_WINDOWS.map((w, idx) => {
    const supported = coveringIdx === -1 ? true : idx <= coveringIdx;
    return {
      key: w.key,
      label: w.label,
      days: w.days,
      supported,
      rate:
        supported && cohort > 0
          ? Math.round((repeated[w.key] / cohort) * 100)
          : null,
    };
  });

  return { cohort, cells };
}
