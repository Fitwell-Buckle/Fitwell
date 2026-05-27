import { terminalStage, type ProductionStage } from "./stages";

// Pure, DB-free cycle-time model for ETA projection. Per-stage estimates start
// from hardcoded defaults and switch to a rolling average once a stage has
// enough recent samples (see resolveStageEstimate). The DB-backed assembly that
// gathers samples lives in cycle-time-data.ts. Stages are dynamic, so the
// pipeline order is passed in where it matters.

/**
 * Initial per-stage duration estimates, in days. ⚠️ PLACEHOLDERS — confirm with
 * Greg. Used until a stage has ≥ MIN_SAMPLES recent completed transitions, after
 * which its rolling average is used instead. Keyed by stage key; user-added
 * stages aren't here and fall back to FALLBACK_STAGE_DAYS.
 */
export const DEFAULT_STAGE_DAYS: Record<string, number> = {
  supplier_po: 3,
  stamping: 2,
  edm: 2,
  polishing: 2,
  logo: 1,
  plating: 3,
  qc: 1,
  packaging: 1,
  complete: 0,
};

/** Estimate for a stage with no default (e.g. a newly added stage). */
export const FALLBACK_STAGE_DAYS = 2;

/** Minimum recent samples before a stage's rolling average replaces the default. */
export const MIN_SAMPLES = 10;

/** Average of a list of day-durations, or null when empty. */
export function averageDays(samples: number[]): number | null {
  if (samples.length === 0) return null;
  const sum = samples.reduce((a, b) => a + b, 0);
  return sum / samples.length;
}

/**
 * The estimate to use for one stage: the rolling average when there are at least
 * MIN_SAMPLES samples, otherwise the hardcoded default (or FALLBACK for unknown
 * stages). Rounded to one decimal.
 */
export function resolveStageEstimate(
  stage: ProductionStage,
  samples: number[],
  defaults: Record<string, number> = DEFAULT_STAGE_DAYS,
): number {
  const avg = averageDays(samples);
  if (avg !== null && samples.length >= MIN_SAMPLES) {
    return Math.round(avg * 10) / 10;
  }
  return defaults[stage] ?? FALLBACK_STAGE_DAYS;
}

/** Build the full estimate map from per-stage samples + defaults. Terminal = 0. */
export function buildStageEstimates(
  order: readonly string[],
  samplesByStage: Partial<Record<ProductionStage, number[]>>,
  defaults: Record<string, number> = DEFAULT_STAGE_DAYS,
): Record<ProductionStage, number> {
  const out = {} as Record<ProductionStage, number>;
  const terminal = terminalStage(order);
  for (const stage of order) {
    out[stage] =
      stage === terminal
        ? 0
        : resolveStageEstimate(stage, samplesByStage[stage] ?? [], defaults);
  }
  return out;
}

/**
 * Days remaining until the terminal stage from `currentStage`: the sum of
 * estimates for the current stage and every stage after it (excluding the
 * terminal stage). A line at/after the terminal returns 0.
 */
export function projectRemainingDays(
  order: readonly string[],
  currentStage: ProductionStage,
  estimates: Record<ProductionStage, number>,
): number {
  const start = order.indexOf(currentStage);
  const terminalIdx = order.length - 1;
  if (start < 0 || start >= terminalIdx) return 0;
  let total = 0;
  for (let i = start; i < terminalIdx; i++) {
    total += estimates[order[i]] ?? 0;
  }
  return total;
}

/** Add `n` days to a YYYY-MM-DD date (UTC), returning a YYYY-MM-DD string. */
export function addDaysISO(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.round(n));
  return d.toISOString().slice(0, 10);
}

/**
 * Projected completion date (YYYY-MM-DD) for a line item at `currentStage`,
 * measured from `fromDate`. Returns `fromDate` for an already-terminal line.
 */
export function projectEta(
  order: readonly string[],
  currentStage: ProductionStage,
  fromDate: string,
  estimates: Record<ProductionStage, number>,
): string {
  return addDaysISO(fromDate, projectRemainingDays(order, currentStage, estimates));
}
