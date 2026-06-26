/**
 * Pure presentational helpers + types for the dashboard Return Drivers card.
 * No DB / server imports, so it's unit-testable in the fast tier.
 */

/** One segment of a return-driver metric (unit-level: units returned ÷ sold). */
export interface ReturnRow {
  segment: string;
  unitsSold: number;
  unitsReturned: number;
  /** Percent of units sold in this segment that were returned. */
  pct: number;
}

/** Time-to-refund band, expressed as a share of ALL units sold (bands sum to
 *  the overall return rate). */
export interface LatencyRow {
  band: string;
  unitsReturned: number;
  pctOfAll: number;
}

export interface ReturnDrivers {
  baseline: { unitsSold: number; unitsReturned: number; pct: number };
  family: ReturnRow[];
  size: ReturnRow[];
  color: ReturnRow[];
  basket: ReturnRow[];
  latency: LatencyRow[];
  source: ReturnRow[];
  timeOfDay: ReturnRow[];
  dayOfWeek: ReturnRow[];
  country: ReturnRow[];
}

export type RiskTone = "high" | "elevated" | "neutral" | "low";

/**
 * Classify a segment's return rate relative to the overall baseline so the UI
 * can tint it. Thresholds are multiplicative so they stay meaningful as the
 * baseline drifts: >=1.5x baseline = high, >=1.15x = elevated, <=0.6x = low.
 * Segments with too little volume are forced neutral — a single return on a
 * tiny denominator shouldn't light up red.
 */
export function riskTone(
  pct: number,
  baseline: number,
  unitsSold = Infinity,
  minUnits = 25,
): RiskTone {
  if (unitsSold < minUnits || baseline <= 0) return "neutral";
  if (pct >= baseline * 1.5) return "high";
  if (pct >= baseline * 1.15) return "elevated";
  if (pct <= baseline * 0.6) return "low";
  return "neutral";
}

/** Tailwind text colour per tone, for the percentage cell. */
export const TONE_TEXT: Record<RiskTone, string> = {
  high: "text-red-600",
  elevated: "text-amber-600",
  neutral: "text-zinc-600",
  low: "text-emerald-600",
};

/** Tailwind bar colour per tone, for the proportion bar. */
export const TONE_BAR: Record<RiskTone, string> = {
  high: "bg-red-500",
  elevated: "bg-amber-400",
  neutral: "bg-zinc-300",
  low: "bg-emerald-400",
};

export function formatPct(pct: number): string {
  return `${pct.toFixed(1)}%`;
}
