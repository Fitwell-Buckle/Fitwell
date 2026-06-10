// Pure (DB-free) seeder for per-(sub-)PO stage target dates. Given a sub-PO's
// issued date, optional sub-PO ETA, the global pipeline, and its lines (each
// with their own per-line `stages` subset + quantity + sku/productId), compute
// one target end date per global pipeline stage by walking every line through
// its own stages and taking the MAX target across lines that visit each stage.
//
// The aggregated target is what the supplier UI's timeline reads to project
// segment ends — it's a heuristic seed, fully editable, refreshed when stage
// assignments change.

import { addDaysISO, estimateLineStageDays, type CycleTimeSamples } from "./cycle-time";
import type { ProductionStage } from "./stages";

export interface SeederLine {
  /** Line's stage subset (ordered). Empty/null → inherit the global pipeline. */
  stages?: readonly string[] | null;
  sku: string;
  productId: string | null;
  quantity: number;
  /** Per-line ETA (YYYY-MM-DD). When set + `ownedStages` is supplied, this
   *  line's last owned stage is anchored to THIS date instead of the
   *  seeder-level `subPoEta`. Lines on the same sub-PO often have
   *  independent deadlines; per-line ETAs let the chart show that. */
  expectedCompletionDate?: string | null;
}

export interface ComputeStageTargetsInput {
  /** Global pipeline order. */
  order: readonly string[];
  /** Sub-PO issued date (YYYY-MM-DD). The cursor starts here for every line. */
  issuedDate: string;
  /** Sub-PO ETA (YYYY-MM-DD), or null. Drives Tier 4 of the estimator AND
   *  (when `ownedStages` is set) anchors the last owned stage to this date. */
  subPoEta: string | null;
  /** Lines on the master that this sub-PO seeds for. */
  lines: SeederLine[];
  samples: CycleTimeSamples;
  defaults?: Record<string, number>;
  /** Stages this sub-PO's supplier owns on the master (in pipeline order).
   *  When set + `subPoEta` is set, the per-line cursor-walked target for
   *  the line's LAST owned stage is replaced with `subPoEta` — so the
   *  supplier's promised delivery aligns with the end of their work.
   *  Other (non-owned) stages still cursor-walk normally; their targets
   *  reflect cycle-time projection, not the sub-PO ETA. */
  ownedStages?: readonly string[];
}

export interface StageTargetSeed {
  stage: ProductionStage;
  targetEndDate: string;
}

/** Days between two YYYY-MM-DD dates, ignoring sign — used to derive
 *  `poTotalDays` for the Tier 4 (PO-split) fallback. */
function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.max(0, ms / (24 * 60 * 60 * 1000));
}

/** Effective stage list for a line — its own when non-empty, else the global. */
function lineStages(
  line: SeederLine,
  order: readonly string[],
): readonly string[] {
  return line.stages && line.stages.length > 0 ? line.stages : order;
}

/**
 * Per-stage target end dates for a (sub-)PO. Each line walks its own stage
 * list with an independent cursor starting at `issuedDate`; the cursor
 * advances by `estimateLineStageDays()` per stage. The aggregated target for
 * a given pipeline stage is `max(end dates)` across lines that actually
 * visit that stage. Stages no line visits get no entry.
 *
 * The terminal (last) stage of the global pipeline is excluded — its
 * "estimate" is 0 days by convention (see DEFAULT_STAGE_DAYS.complete) and a
 * target date for it would be a no-op on the timeline chart.
 */
export function computeStageTargets(
  input: ComputeStageTargetsInput,
): StageTargetSeed[] {
  const { order, issuedDate, subPoEta, lines, samples, defaults, ownedStages } =
    input;
  if (lines.length === 0 || order.length === 0) return [];

  const terminalIdx = order.length - 1;
  const poTotalDays =
    subPoEta != null ? daysBetween(issuedDate, subPoEta) : null;
  const ownedSet = ownedStages ? new Set(ownedStages) : null;
  const anchorActive = !!(ownedSet && subPoEta);

  // For each global stage, collect the candidate end dates from contributing
  // lines (ISO YYYY-MM-DD strings sort correctly with `>` so we can max via
  // lex compare).
  const candidates = new Map<ProductionStage, string[]>();

  for (const line of lines) {
    const walkOrder = lineStages(line, order);
    const lineStageCount = walkOrder.length > 0 ? walkOrder.length : order.length;

    // Per-line anchor target: the line's own ETA wins over the seeder-level
    // sub-PO ETA. Lines on the same sub-PO often have independent
    // deadlines; the chart's right edge per line should match that line's
    // own promise, not the sub-PO rollup.
    const lineAnchor =
      line.expectedCompletionDate && line.expectedCompletionDate.length > 0
        ? line.expectedCompletionDate
        : subPoEta;

    // Tier 4 (PO-split) days per line — use the line's own ETA when set,
    // else fall back to the seeder-level subPoEta.
    const lineTotalDays =
      lineAnchor != null ? daysBetween(issuedDate, lineAnchor) : poTotalDays;

    // Find this line's LAST owned stage (last walked stage that's in
    // ownedSet). If `anchorActive` and the line has an anchor, that
    // stage's target gets replaced with the anchor date — pinning the
    // supplier's promised delivery (per line) to where their work ends.
    let lastOwnedIdxOnLine = -1;
    if (anchorActive) {
      for (let i = walkOrder.length - 1; i >= 0; i--) {
        const stage = walkOrder[i] as ProductionStage;
        if (order.indexOf(stage) === terminalIdx) continue;
        if (ownedSet!.has(stage)) {
          lastOwnedIdxOnLine = i;
          break;
        }
      }
    }

    let cursor = issuedDate;
    for (let i = 0; i < walkOrder.length; i++) {
      const stage = walkOrder[i] as ProductionStage;
      const globalIdx = order.indexOf(stage);
      // Skip the global terminal — that's the "complete" sentinel; we don't
      // write a target for it. Lines whose own pipeline ends earlier
      // (anything before complete) still contribute to the previous stage's
      // target — that's just where the line is "done".
      if (globalIdx === terminalIdx) continue;

      const { days } = estimateLineStageDays({
        stage,
        sku: line.sku,
        productId: line.productId,
        lineQty: line.quantity,
        lineStageCount,
        poTotalDays: lineTotalDays,
        samples,
        defaults,
      });

      let endDate = addDaysISO(cursor, days);
      // Anchor: the line's last owned stage lands exactly on lineAnchor
      // (per-line ETA when set, otherwise sub-PO ETA). Only when the
      // cursor-walked end is BEFORE the anchor — natural overruns stay
      // visible as real signal.
      if (
        anchorActive &&
        i === lastOwnedIdxOnLine &&
        lineAnchor &&
        endDate < lineAnchor
      ) {
        endDate = lineAnchor;
      }
      const bucket = candidates.get(stage) ?? [];
      bucket.push(endDate);
      candidates.set(stage, bucket);
      cursor = endDate;
    }
  }

  // Emit one entry per stage, in global pipeline order, with the max
  // candidate. Stages no line visits are silently omitted.
  //
  // Monotonicity clamp: target end dates must be non-decreasing along the
  // global pipeline. Without this, MAX-per-stage can produce inversions —
  // e.g. a high-qty spring-bar line drives `stamping` to 06-11, while only
  // a buckle line walks `edm` and dates it 06-07 (earlier!). Physically
  // edm can't complete before stamping does, so we clamp each stage's
  // target to at least the previous emitted stage's target.
  const out: StageTargetSeed[] = [];
  let prev: string | null = null;
  for (const stage of order) {
    const bucket = candidates.get(stage);
    if (!bucket || bucket.length === 0) continue;
    let target = bucket.reduce((acc, d) => (d > acc ? d : acc), bucket[0]);
    if (prev !== null && target < prev) target = prev;
    out.push({ stage, targetEndDate: target });
    prev = target;
  }
  return out;
}

// ─── Chip-toggle helper (UI logic, pure) ──────────────────────────────────
// The new-PO form's per-line stage chips track an opt-in subset: `null` means
// "inherit the PO pipeline" (every chip on, no subset persisted); a non-null
// list is the ordered `[opening, ...checkedWorkStages, terminal]` walk. The
// opening and terminal bookends are always implicit. When the user re-checks
// every work stage, the value collapses back to `null` so the DB never sees
// an explicit "all stages" subset.
//
// Lives here (not in the React component) so we can unit-test it without
// mounting React.

/** Decide whether each work stage is on, given the current chip value. */
export function isStageOn(
  stage: string,
  value: readonly string[] | null,
): boolean {
  return value === null ? true : value.includes(stage);
}

/** Apply a chip toggle. Returns the next value to store — `null` when every
 *  work stage is back on, otherwise the explicit ordered subset. */
export function toggleStageChip(
  stage: string,
  order: readonly string[],
  value: readonly string[] | null,
): string[] | null {
  if (order.length < 3) return null; // no work stages to skip
  const opening = order[0];
  const terminal = order[order.length - 1];
  const workStages = order.slice(1, -1);

  // Build the next set of on-work-stages from the prior value.
  const checked = new Set(workStages.filter((s) => isStageOn(s, value)));
  if (checked.has(stage)) checked.delete(stage);
  else checked.add(stage);

  // If everything's back on, collapse to null (inherit).
  if (workStages.every((s) => checked.has(s))) return null;

  // Otherwise emit the ordered subset including the bookends.
  return [opening, ...workStages.filter((s) => checked.has(s)), terminal];
}
