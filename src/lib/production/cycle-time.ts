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

// ──────────────────────────────────────────────────────────────────────────
// Tiered cycle-time estimator (per-line / per-stage)
//
// For the SUB-PO STAGE TARGET SEEDER, we need a richer estimate than the
// flat per-stage `estimates` map: how long this specific line, at this stage,
// is likely to take — accounting for SKU/product specifics and the line's
// quantity. The five tiers fall through in priority order:
//
//   1. (sku, stage)         — line-quantity-normalized rolling avg, ≥ MIN_SAMPLES
//   2. (productId, stage)   — same, keyed by product instead of SKU
//   3. (stage)              — global rolling avg, ≥ MIN_SAMPLES
//   4. PO-derived           — (subPoEta − issued) / lineStageCount, no qty
//   5. Hardcoded defaults   — DEFAULT_STAGE_DAYS, no qty
//
// Tiers 1–3 are sampled in days-per-unit (sample = stage_duration / line_qty),
// so they're multiplied by `lineQty` to get this line's days. Tier 4 is a
// per-stage slice of total PO time (already batch-level → no qty factor).
// Tier 5 is the absolute fallback.
//
// The data-assembly half (joining stage events with their line items) lives
// in cycle-time-data.ts; this is the pure / unit-tested half.
// ──────────────────────────────────────────────────────────────────────────

/** Per-unit-day samples bucketed three ways. Each sample is
 *  `event.duration_days / event.line.quantity` — so averaging gives
 *  days-per-unit, and the line's own qty becomes the multiplier. */
export interface CycleTimeSamples {
  bySkuStage: Map<string, number[]>; // key: `${sku}::${stage}`
  byProductStage: Map<string, number[]>; // key: `${productId}::${stage}`
  byStage: Map<string, number[]>; // key: stage
}

/** Round half-up to one decimal — same rounding the existing rolling-avg uses. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Compose a tier key without colliding when ids contain colons. */
function key(a: string, b: string): string {
  return `${a}::${b}`;
}

/** Build empty sample buckets — the data layer fills them in. */
export function emptyCycleTimeSamples(): CycleTimeSamples {
  return {
    bySkuStage: new Map(),
    byProductStage: new Map(),
    byStage: new Map(),
  };
}

/** Push a single duration sample. `productId` may be null for SKUs without
 *  a product link; that sample then only contributes to SKU + global tiers. */
export function pushCycleTimeSample(
  samples: CycleTimeSamples,
  args: {
    sku: string;
    productId: string | null;
    stage: ProductionStage;
    durationDays: number;
    quantity: number;
  },
): void {
  if (args.quantity <= 0 || args.durationDays < 0) return;
  const perUnit = args.durationDays / args.quantity;
  const push = (map: Map<string, number[]>, k: string) => {
    const existing = map.get(k);
    if (existing) existing.push(perUnit);
    else map.set(k, [perUnit]);
  };
  push(samples.bySkuStage, key(args.sku, args.stage));
  if (args.productId) push(samples.byProductStage, key(args.productId, args.stage));
  push(samples.byStage, args.stage);
}

export interface LineStageEstimateInput {
  stage: ProductionStage;
  sku: string;
  /** Product key (e.g. Shopify product id) for tier-2 grouping. Null disables tier 2. */
  productId: string | null;
  /** Line quantity — multiplier for tiers 1–3 (per-unit). */
  lineQty: number;
  /** Number of stages on the line's own pipeline (subset, or global count if no subset). */
  lineStageCount: number;
  /** Total PO days = subPoEta − issued, for tier 4. Null disables tier 4. */
  poTotalDays: number | null;
  samples: CycleTimeSamples;
  defaults?: Record<string, number>;
}

export interface LineStageEstimate {
  days: number;
  /** Which tier supplied the estimate — useful for ops + tests. */
  source: "sku" | "product" | "global" | "po_split" | "default";
}

/** Days for ONE line in ONE stage, walking the 5-tier fallback. */
export function estimateLineStageDays(
  args: LineStageEstimateInput,
): LineStageEstimate {
  const defaults = args.defaults ?? DEFAULT_STAGE_DAYS;

  // Tier 1: SKU + stage rolling avg (per-unit) × line qty
  const skuSamples = args.samples.bySkuStage.get(key(args.sku, args.stage)) ?? [];
  if (skuSamples.length >= MIN_SAMPLES) {
    const perUnit = averageDays(skuSamples)!;
    return { days: round1(Math.max(0, perUnit * args.lineQty)), source: "sku" };
  }

  // Tier 2: product + stage rolling avg (per-unit) × line qty
  if (args.productId) {
    const prodSamples =
      args.samples.byProductStage.get(key(args.productId, args.stage)) ?? [];
    if (prodSamples.length >= MIN_SAMPLES) {
      const perUnit = averageDays(prodSamples)!;
      return { days: round1(Math.max(0, perUnit * args.lineQty)), source: "product" };
    }
  }

  // Tier 3: global rolling avg (per-unit) × line qty
  const globalSamples = args.samples.byStage.get(args.stage) ?? [];
  if (globalSamples.length >= MIN_SAMPLES) {
    const perUnit = averageDays(globalSamples)!;
    return { days: round1(Math.max(0, perUnit * args.lineQty)), source: "global" };
  }

  // Tier 4: even spread = poTotalDays / lineStageCount (batch-level, no qty)
  if (args.poTotalDays != null && args.lineStageCount > 0) {
    return {
      days: round1(Math.max(0, args.poTotalDays / args.lineStageCount)),
      source: "po_split",
    };
  }

  // Tier 5: hardcoded defaults
  return {
    days: defaults[args.stage] ?? FALLBACK_STAGE_DAYS,
    source: "default",
  };
}
