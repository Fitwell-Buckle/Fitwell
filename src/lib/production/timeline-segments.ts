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

/** Solid segments from a line's stage history (with a 6-hour floor so a
 *  same-day move still renders as a visible block) plus a faded projected
 *  segment for each remaining stage on the way to terminal. A projected
 *  segment's end date is the supplied per-stage target (`stageTargetsMs`)
 *  when set; otherwise today's cursor + the stage's cycle-time estimate.
 *  Pure — safe to call from server-render aggregation OR client components. */
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
  const segs: TimelineSegment[] = li.stageEvents.map((ev) => {
    const startMs = ev.enteredAt.getTime();
    const endMs = ev.exitedAt ? ev.exitedAt.getTime() : todayMs;
    return {
      stage: ev.stage,
      startMs,
      endMs: Math.max(endMs, startMs + MS_PER_DAY / 4),
      projected: false,
    };
  });
  if (isTerminal(walkOrder, li.currentStage)) return segs;

  const startIdx = walkOrder.indexOf(li.currentStage);
  if (startIdx < 0) return segs;
  let cursorMs = todayMs;
  for (let i = startIdx; i < walkOrder.length - 1; i++) {
    const stage = walkOrder[i] as ProductionStage;
    const target = stageTargetsMs.get(stage);
    let endMs: number;
    if (target != null && target > cursorMs) {
      endMs = target;
    } else {
      const days = estimates[stage] ?? FALLBACK_STAGE_DAYS;
      endMs = cursorMs + days * MS_PER_DAY;
    }
    endMs = Math.max(endMs, cursorMs + MS_PER_DAY / 4);
    segs.push({ stage, startMs: cursorMs, endMs, projected: true });
    cursorMs = endMs;
  }
  return segs;
}
