import { STAGES, type ProductionStage } from "./stages";

// Pure, DB-free cycle-time model for ETA projection. Per-stage estimates start
// from hardcoded defaults and switch to a rolling average once a stage has
// enough recent samples (see resolveStageEstimate). The DB-backed assembly that
// gathers samples lives in cycle-time-data.ts.

/**
 * Initial per-stage duration estimates, in days. ⚠️ PLACEHOLDERS — confirm with
 * Greg. Used until a stage has ≥ MIN_SAMPLES recent completed transitions, after
 * which its rolling average is used instead. "complete" is terminal (0).
 */
export const DEFAULT_STAGE_DAYS: Record<ProductionStage, number> = {
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
 * MIN_SAMPLES samples, otherwise the hardcoded default. Rounded to one decimal.
 */
export function resolveStageEstimate(
  stage: ProductionStage,
  samples: number[],
  defaults: Record<ProductionStage, number> = DEFAULT_STAGE_DAYS,
): number {
  if (stage === "complete") return 0;
  const avg = averageDays(samples);
  if (avg !== null && samples.length >= MIN_SAMPLES) {
    return Math.round(avg * 10) / 10;
  }
  return defaults[stage];
}

/** Build the full estimate map from per-stage samples + defaults. */
export function buildStageEstimates(
  samplesByStage: Partial<Record<ProductionStage, number[]>>,
  defaults: Record<ProductionStage, number> = DEFAULT_STAGE_DAYS,
): Record<ProductionStage, number> {
  const out = {} as Record<ProductionStage, number>;
  for (const stage of STAGES) {
    out[stage] = resolveStageEstimate(stage, samplesByStage[stage] ?? [], defaults);
  }
  return out;
}

/**
 * Days remaining until "complete" from the current stage: the sum of estimates
 * for the current stage and every stage after it (excluding the terminal
 * "complete"). A completed line item returns 0.
 */
export function projectRemainingDays(
  currentStage: ProductionStage,
  estimates: Record<ProductionStage, number>,
): number {
  const start = STAGES.indexOf(currentStage);
  if (start < 0 || currentStage === "complete") return 0;
  let total = 0;
  for (let i = start; i < STAGES.length; i++) {
    if (STAGES[i] === "complete") break;
    total += estimates[STAGES[i]];
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
 * measured from `fromDate`. Returns `fromDate` for an already-complete line.
 */
export function projectEta(
  currentStage: ProductionStage,
  fromDate: string,
  estimates: Record<ProductionStage, number>,
): string {
  return addDaysISO(fromDate, projectRemainingDays(currentStage, estimates));
}
