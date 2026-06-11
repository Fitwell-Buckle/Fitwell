// Pure (server- + client-safe) production-timeline math. Mirrors
// what `components/production/production-timeline.tsx` needs for the bar
// rendering, but isolated from React so the page's Master-view aggregation
// can pre-compute the per-supplier stack on the server.

import { isTerminal, type ProductionStage } from "./stages";
import { FALLBACK_STAGE_DAYS } from "./cycle-time";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function utcMidnight(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

export interface TimelineSegment {
  stage: ProductionStage;
  startMs: number;
  endMs: number;
  /** `false` when this segment is strictly in the past (a completed
   *  stage with a known exitedAt); `true` for the line's current stage
   *  (in-progress) and every future stage. Used to gate the inline ETA
   *  editor — only `projected` segments are click-to-edit. The visual
   *  style does NOT differ between projected and not. */
  projected: boolean;
}

export interface LineForSegments {
  currentStage: ProductionStage;
  stageEvents: {
    stage: ProductionStage;
    enteredAt: Date;
    exitedAt: Date | null;
  }[];
  /** Per-line stage list — when set, the projected segment chain walks THIS
   *  list instead of the global `order` (so a spring-bar line with
   *  `stages = [supplier_po, stamping, packaging]` only projects 2 future
   *  segments, not 7). NULL/undefined = inherit `order`. */
  stages?: readonly string[] | null;
}

/**
 * Continuous-chain segments for a line's timeline bar.
 *
 * One segment per stage in the line's `walkOrder` (excluding the terminal
 * `complete` sentinel). Each segment starts exactly where the previous one
 * ended — the bar is a single uninterrupted strip from the line's first
 * stage_event (or today, if the line has no events yet) to its projected
 * completion. There are no gaps and no overlaps; the caller paints a
 * single "today" vertical line across the chart to indicate what's past
 * vs. future.
 *
 * Past stages (those strictly before `currentStage` in `walkOrder`) use
 * their consolidated stage_event range — `min(enteredAt)` to
 * `max(exitedAt)` if there were multiple advance-then-move-back cycles.
 * If a past stage has no events at all (e.g. it was skipped silently),
 * we cursor-walk it forward using the cycle-time estimate so the chain
 * stays unbroken.
 *
 * The current stage starts at its earliest enteredAt (or the cursor if no
 * event) and ends at its projected target — `stageTargetsMs.get(stage)`
 * when set and in the future, otherwise `max(today, enteredAt) + estimate`.
 *
 * Future stages chain from the previous segment's end, using
 * `stageTargetsMs` when present (and not behind the cursor) or the
 * cycle-time estimate.
 *
 * Pure — safe to call from server-render aggregation OR client components.
 */
export function buildLineSegments(
  li: LineForSegments,
  todayMs: number,
  _todayIso: string,
  order: readonly string[],
  estimates: Record<ProductionStage, number>,
  stageTargetsMs: Map<ProductionStage, number> = new Map(),
): TimelineSegment[] {
  // Effective walk-order: line's own list when set, else the global pipeline.
  const walkOrder = li.stages && li.stages.length > 0 ? li.stages : order;
  if (walkOrder.length === 0) return [];

  // Already at terminal — emit the historical chain only (one consolidated
  // segment per visited stage, capped at the line's exit). The line is done;
  // there's nothing to project.
  const terminal = isTerminal(walkOrder, li.currentStage);

  // Consolidate stage_events: a stage may have multiple events if the line
  // was advanced then moved back. Collapse to one range: the earliest
  // enteredAt and the latest exitedAt (with null meaning "still ongoing").
  const ranges = new Map<
    ProductionStage,
    { start: number; end: number | null }
  >();
  for (const ev of li.stageEvents) {
    const startMs = ev.enteredAt.getTime();
    const endMs = ev.exitedAt?.getTime() ?? null;
    const existing = ranges.get(ev.stage);
    if (!existing) {
      ranges.set(ev.stage, { start: startMs, end: endMs });
      continue;
    }
    if (startMs < existing.start) existing.start = startMs;
    // null wins (ongoing); otherwise take the latest exitedAt.
    if (endMs === null) existing.end = null;
    else if (existing.end !== null && endMs > existing.end) existing.end = endMs;
  }

  const currentIdx = walkOrder.indexOf(li.currentStage);
  if (currentIdx < 0 && !terminal) return [];

  // Effective "current" index for chain logic: terminal lines treat every
  // walked stage as past.
  const effectiveCurrentIdx = terminal ? walkOrder.length : currentIdx;

  // Cursor starts at the earliest stage_event we have (the line's
  // birthday) — or today if the line is brand new and has no events yet.
  const firstStageRange = ranges.get(walkOrder[0] as ProductionStage);
  let cursorMs = firstStageRange?.start ?? todayMs;

  const segs: TimelineSegment[] = [];

  // Walk every stage except the terminal sentinel — `complete` is a marker,
  // not a stage with duration.
  for (let i = 0; i < walkOrder.length - 1; i++) {
    const stage = walkOrder[i] as ProductionStage;
    const range = ranges.get(stage);
    const target = stageTargetsMs.get(stage);
    const isPast = i < effectiveCurrentIdx;
    const isCurrent = i === currentIdx && !terminal;

    let startMs = cursorMs;
    let endMs: number;

    if (isPast) {
      // Use the consolidated exitedAt if known; otherwise estimate.
      if (range?.end != null) {
        endMs = Math.max(range.end, startMs);
      } else if (range?.start != null) {
        // Past with no exitedAt (data anomaly): use today as a reasonable cap
        endMs = Math.max(startMs, todayMs);
      } else {
        // No events at all for this past stage: cursor-walk
        const days = estimates[stage] ?? FALLBACK_STAGE_DAYS;
        endMs = startMs + days * MS_PER_DAY;
      }
    } else if (isCurrent) {
      // Project from today (or from the cursor if it's already in the
      // future — should never happen but guard against it). Target wins
      // when set and ahead of the projection floor.
      const projFloor = Math.max(todayMs, startMs);
      if (target != null && target > projFloor) {
        endMs = target;
      } else {
        const days = estimates[stage] ?? FALLBACK_STAGE_DAYS;
        endMs = projFloor + days * MS_PER_DAY;
      }
    } else {
      // Future stage: cursor + estimate (or explicit target ahead of cursor).
      if (target != null && target > startMs) {
        endMs = target;
      } else {
        const days = estimates[stage] ?? FALLBACK_STAGE_DAYS;
        endMs = startMs + days * MS_PER_DAY;
      }
    }

    // Visible minimum so a same-day move still renders as a block.
    endMs = Math.max(endMs, startMs + MS_PER_DAY / 4);
    segs.push({
      stage,
      startMs,
      endMs,
      // "projected" = current stage in-progress OR a future stage. Past
      // stages are NOT projected (their dates are real history) and not
      // editable in the inline target editor.
      projected: !isPast,
    });
    cursorMs = endMs;
  }

  // Authoritative ETA: when the line's LAST projected stage carries an explicit
  // target (the per-line "Final ETA" anchors exactly that stage), make the bar
  // END on that date — scale the whole projected chain to fit [projStart,
  // target] instead of letting cycle-time estimates overshoot it. Estimates now
  // only set the *relative* widths of the projected stages; the ETA is the
  // source of truth. (We have too little cycle-time history to trust the raw
  // projection yet — so an explicit promise date wins over the algorithm.)
  // With no such target the estimate projection stands unchanged. This also
  // makes a no-op when the estimate projection already lands on the target.
  const projected = segs.filter((s) => s.projected);
  if (projected.length > 0) {
    const last = projected[projected.length - 1];
    const finalTarget = stageTargetsMs.get(last.stage);
    if (finalTarget != null) {
      const projStart = projected[0].startMs;
      const naturalEnd = last.endMs;
      if (naturalEnd > projStart && finalTarget > projStart) {
        // Compress (ETA earlier than estimates) or stretch (ETA later) the
        // projected chain so its last segment ends exactly on the target.
        const scale = (finalTarget - projStart) / (naturalEnd - projStart);
        for (const s of projected) {
          s.startMs = projStart + (s.startMs - projStart) * scale;
          s.endMs = projStart + (s.endMs - projStart) * scale;
        }
      } else if (naturalEnd > projStart) {
        // ETA at/before the projection can even start: the deadline is already
        // unrealistic — show each projected stage as a thin sliver rather than
        // a negative-width bar.
        let cur = projStart;
        for (const s of projected) {
          s.startMs = cur;
          s.endMs = cur + MS_PER_DAY / 4;
          cur = s.endMs;
        }
      }
    }
  }

  return segs;
}
