/**
 * Repeat-purchase window math for the dashboard "Customer Value & Retention"
 * table.
 *
 * The metric answers: of a segment's customers, what share placed a 2nd order
 * within N days of their first? We report several windows (30d / 90d / 6mo /
 * 1yr) side by side.
 *
 * The trap (and the reason this lives in a tested helper): if each window uses
 * its own eligible cohort — "customers observed long enough for *that* window"
 * — the columns rest on DIFFERENT, shrinking denominators. A wider window can
 * then show a *lower* rate than a narrower one (it dropped the younger, often
 * more-active customers), and a window barely covered by the selected range
 * rests on a tiny, unrepresentative sliver. That produces the "fewer repeats at
 * 6mo than 90d" and "0% at 1yr" anomalies.
 *
 * Fix: a single SHARED denominator. We pick one eligibility horizon — the
 * widest window the selected range can actually support (`anchorWindowDays`) —
 * and every column is computed over the same cohort: customers whose first
 * in-range order is old enough to have been observed for that full horizon.
 * Because the cohort is fixed and "repeated within 30d" ⊆ "within 90d" ⊆ … ,
 * the rates are guaranteed to be non-decreasing left to right and are directly
 * comparable. Windows wider than the range (no shared observation) report null.
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
  /** First in-range order timestamp (ms). Customers with null are skipped. */
  firstOrderMs: number | null;
  /** Second in-range order timestamp (ms), or null for one-and-done. */
  secondOrderMs: number | null;
}

export interface RepeatWindowCell {
  key: RepeatWindowKey;
  label: string;
  days: number;
  /** Whether the selected range is wide enough to observe this window. */
  supported: boolean;
  /**
   * Repeat rate (0–100) over the shared cohort, or null when the window is
   * unsupported by the range or the cohort is empty.
   */
  rate: number | null;
}

export interface RepeatWindowSummary {
  /** Shared denominator: customers observed for the full anchor horizon. */
  cohort: number;
  /** The eligibility horizon (days) every column shares; 0 = none supported. */
  anchorDays: number;
  cells: RepeatWindowCell[];
}

/**
 * The widest repeat window whose horizon fits inside the selected range — the
 * single eligibility horizon all columns share. Returns 0 when the range is
 * shorter than even the narrowest window (nothing measurable).
 */
export function anchorWindowDays(rangeDays: number): number {
  let anchor = 0;
  for (const w of REPEAT_WINDOWS) {
    if (w.days <= rangeDays) anchor = Math.max(anchor, w.days);
  }
  return anchor;
}

/**
 * Compute repeat-window rates for one segment over a single shared cohort.
 *
 * @param timings           one entry per customer in the segment
 * @param observedThroughMs end of the selected range (ms) — the horizon a
 *                          customer has had to come back within view
 * @param rangeDays         width of the selected range in days
 */
export function computeRepeatWindows(
  timings: RepeatTiming[],
  observedThroughMs: number,
  rangeDays: number,
): RepeatWindowSummary {
  const anchorDays = anchorWindowDays(rangeDays);
  let cohort = 0;
  const repeated: Record<RepeatWindowKey, number> = {
    d30: 0,
    d90: 0,
    m6: 0,
    y1: 0,
  };

  if (anchorDays > 0) {
    for (const t of timings) {
      if (t.firstOrderMs == null) continue;
      const ageDays = (observedThroughMs - t.firstOrderMs) / DAY_MS;
      // Shared cohort: only customers observed for the full anchor horizon.
      if (ageDays < anchorDays) continue;
      cohort += 1;
      const gapDays =
        t.secondOrderMs == null
          ? Infinity
          : (t.secondOrderMs - t.firstOrderMs) / DAY_MS;
      for (const w of REPEAT_WINDOWS) {
        if (w.days > anchorDays) continue; // not observable for this range
        if (gapDays <= w.days) repeated[w.key] += 1;
      }
    }
  }

  const cells: RepeatWindowCell[] = REPEAT_WINDOWS.map((w) => {
    const supported = anchorDays > 0 && w.days <= anchorDays;
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

  return { cohort, anchorDays, cells };
}
