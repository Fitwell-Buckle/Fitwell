"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { isTerminal, type ProductionStage } from "@/lib/production/stages";
import { STAGE_BAR, fmtDate, skuSize } from "@/lib/production/display";
import { formatPoNumber } from "@/lib/production/sub-po";
import { DRILL_ORIGIN_KEY } from "@/app/(admin)/modules/production/drill-panel";
import {
  MS_PER_DAY,
  buildLineSegments,
  isoDay,
  utcMidnight,
  type TimelineSegment,
} from "@/lib/production/timeline-segments";

export {
  buildLineSegments,
  type TimelineSegment,
} from "@/lib/production/timeline-segments";

// Shared geometry helpers + sub-components used by every timeline view (the
// per-line-item chart here AND `PoExpandableTimeline` on the POs & Production
// page). Editing the bar look, hover tooltip, or bottom axis HERE is the
// single source of truth for both — don't duplicate them downstream.

interface AxisTick {
  pct: number;
  label: string;
  align: "start" | "middle" | "end";
}

/** PUT a stage-target update to `${base}/${poId}/stage-eta`, throw on
 *  non-OK so the inline editor can show the server's error, and refresh
 *  the page on success so the chart reflows. Used internally by both
 *  `ProductionTimeline` and `PoExpandableTimeline` when their callers
 *  supply `etaSaveRouteBase`. */
export function makeStageEtaSaver(
  routeBase: string,
  router: { refresh: () => void },
): (poId: string, stage: ProductionStage, dateIso: string | null) => Promise<void> {
  return async (poId, stage, dateIso) => {
    const res = await fetch(
      `${routeBase}/${encodeURIComponent(poId)}/stage-eta`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, targetEndDate: dateIso }),
      },
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Couldn't save the stage target.");
    }
    router.refresh();
  };
}

/** Index a list of `TimelinePo`s by id, converting each PO's target dates
 *  to UTC midnight ms for use by `buildLineSegments` + the editor's seed
 *  value. POs without targets get an empty Map. */
export function buildTargetsByPoId(
  pos: TimelinePo[],
): Map<string, Map<ProductionStage, number>> {
  const byPo = new Map<string, Map<ProductionStage, number>>();
  for (const po of pos) {
    const map = new Map<ProductionStage, number>();
    for (const t of po.stageTargets ?? []) {
      map.set(t.stage, utcMidnight(t.targetEndDate));
    }
    byPo.set(po.id, map);
  }
  return byPo;
}

function buildAxisTicks(minMs: number, maxMs: number, count = 5): AxisTick[] {
  const range = Math.max(maxMs - minMs, MS_PER_DAY);
  return Array.from({ length: count }, (_, i) => {
    const ratio = i / (count - 1);
    return {
      pct: ratio * 100,
      label: fmtDate(isoDay(new Date(minMs + range * ratio))),
      align: i === 0 ? "start" : i === count - 1 ? "end" : "middle",
    };
  });
}

/** The colored stage segments + a vertical "today" rule, with native title
 *  tooltips that read "{Stage} · {start} → {end} ({projected})" on hover.
 *
 *  When `editable` is set, every PROJECTED segment becomes clickable. Clicking
 *  one swaps the bar for an inline date editor and calls `editable.onSave`
 *  with the new YYYY-MM-DD target (or null to clear). Past actual segments
 *  remain read-only — their dates come from stage history. */
export function TimelineBar({
  segs,
  todayMs,
  minMs,
  maxMs,
  stageLabels,
  editable,
}: {
  segs: TimelineSegment[];
  todayMs: number;
  minMs: number;
  maxMs: number;
  stageLabels: Record<ProductionStage, string>;
  editable?: {
    /** Current per-stage target dates (ms), used to seed the editor input
     *  with whatever's already saved instead of the cycle-time projection. */
    targetsMs: Map<ProductionStage, number>;
    onSave: (
      stage: ProductionStage,
      dateIso: string | null,
    ) => Promise<void>;
  };
}) {
  const range = Math.max(maxMs - minMs, MS_PER_DAY);
  const pct = (ms: number) => ((ms - minMs) / range) * 100;

  const [editingStage, setEditingStage] = useState<ProductionStage | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openEditor(stage: ProductionStage, fallbackMs: number) {
    if (!editable) return;
    const seedMs = editable.targetsMs.get(stage) ?? fallbackMs;
    setDraft(isoDay(new Date(seedMs)));
    setEditingStage(stage);
    setError(null);
  }
  async function commit(action: "save" | "clear") {
    if (!editable || !editingStage) return;
    setBusy(true);
    setError(null);
    try {
      await editable.onSave(editingStage, action === "clear" ? null : draft);
      setEditingStage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  if (editingStage && editable) {
    return (
      <div className="flex h-6 flex-1 items-center gap-2 rounded bg-amber-50 px-2 text-xs">
        <span className="font-medium text-zinc-800">
          {stageLabels[editingStage]}
        </span>
        <span className="text-zinc-500">target</span>
        <input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy}
          className="h-5 rounded border border-zinc-200 bg-white px-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300"
        />
        <button
          type="button"
          onClick={() => commit("save")}
          disabled={busy || !draft}
          className="rounded bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => commit("clear")}
          disabled={busy}
          className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-900"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => setEditingStage(null)}
          disabled={busy}
          className="ml-auto text-xs text-zinc-400 hover:text-zinc-900"
        >
          Cancel
        </button>
        {error && (
          <span className="ml-2 truncate text-xs text-red-600" title={error}>
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-6 flex-1 rounded bg-zinc-50">
      <div
        className="absolute top-0 z-10 h-full w-px bg-zinc-300"
        style={{ left: `${pct(todayMs)}%` }}
      />
      {segs.map((s, i) => {
        const startLabel = fmtDate(isoDay(new Date(s.startMs)));
        const endLabel = fmtDate(isoDay(new Date(s.endMs)));
        const span =
          startLabel === endLabel ? startLabel : `${startLabel} → ${endLabel}`;
        const hasOverride = !!editable?.targetsMs.has(s.stage);
        const editableSeg = !!editable && s.projected;
        const tip = `${stageLabels[s.stage]}${
          s.projected ? " (projected)" : ""
        } · ${span}${hasOverride ? " · target set" : ""}${
          editableSeg ? " · click to edit" : ""
        }`;
        const style = {
          left: `${pct(s.startMs)}%`,
          width: `${Math.max(pct(s.endMs) - pct(s.startMs), 0.5)}%`,
        };
        // Projected segments render half-height (and centred vertically in
        // the row) so the eye reads them as distinct from completed work —
        // faded colour alone wasn't enough to tell EDM-projected from
        // Polishing-projected at a glance.
        const sizeClass = s.projected ? "top-2 h-2" : "top-1 h-4";
        const colorClass = `${STAGE_BAR[s.stage] ?? "bg-zinc-300"} ${
          s.projected ? "opacity-30" : ""
        }`;
        return editableSeg ? (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openEditor(s.stage, s.endMs);
            }}
            className={`absolute ${sizeClass} rounded-sm border-0 p-0 ${colorClass} cursor-pointer hover:ring-2 hover:ring-zinc-900/40`}
            style={style}
            title={tip}
          />
        ) : (
          <div
            key={i}
            className={`absolute ${sizeClass} rounded-sm ${colorClass}`}
            style={style}
            title={tip}
          />
        );
      })}
    </div>
  );
}

/** Bottom date axis row, with the same `w-48` / `flex-1` / `w-24` gutters
 *  the track rows use so ticks sit flush under the bars above. */
export function TimelineAxisRow({
  minMs,
  maxMs,
}: {
  minMs: number;
  maxMs: number;
}) {
  const ticks = buildAxisTicks(minMs, maxMs);
  return (
    <div className="flex items-center gap-3 border-t border-zinc-100 px-4 py-2">
      <div className="w-48 shrink-0" />
      <div className="relative h-3 flex-1">
        {ticks.map((tick, i) => (
          <span
            key={i}
            className="absolute top-0 whitespace-nowrap text-[10px] leading-3 text-zinc-400"
            style={{
              left: `${tick.pct}%`,
              transform:
                tick.align === "end"
                  ? "translateX(-100%)"
                  : tick.align === "middle"
                    ? "translateX(-50%)"
                    : undefined,
            }}
          >
            {tick.label}
          </span>
        ))}
      </div>
      <div className="w-24 shrink-0" />
    </div>
  );
}

export interface TimelinePo {
  id: string;
  shopifyPoNumber: string;
  supplier: { name: string } | null;
  /** Per-stage editable target dates for this (sub-)PO. Overrides the
   *  cycle-time projection on the chart when present; absent → cycle-time. */
  stageTargets?: { stage: ProductionStage; targetEndDate: string }[];
  lineItems: {
    id: string;
    sku: string;
    title: string;
    currentStage: ProductionStage;
    /** Per-line stage list — when set, the projected segment chain walks THIS
     *  list instead of the global `order` (so a line that skips EDM/polishing
     *  doesn't get phantom segments for them). NULL/undefined = inherit `order`. */
    stages?: readonly string[] | null;
    // Per-line owning supplier + sub-PO number (the supplier responsible for the
    // line's current stage); falls back to the PO's primary supplier/number.
    supplierName?: string;
    poNumber?: string;
    stageEvents: {
      id: string;
      stage: ProductionStage;
      enteredAt: Date;
      exitedAt: Date | null;
    }[];
    /** Pre-computed per-supplier bars for a multi-supplier master. When set,
     *  the chart renders one stacked bar per entry instead of the single
     *  bar derived from `stageEvents`; each bar's segments are filtered to
     *  the supplier's owned stages (so e.g. bar A covers supplier_po +
     *  stamping, bar B picks up at polishing and runs to packaging). Caller
     *  is responsible for the per-supplier segment math — typically a server
     *  build that runs `buildLineSegments` once then groups by
     *  stage→supplier. */
    subBars?: {
      supplierName: string;
      /** Sub-PO id this bar belongs to — used for stage-ETA edits when
       *  hovering / clicking a segment on this row. */
      poId: string;
      segs: TimelineSegment[];
      etaMs?: number | null;
    }[];
  }[];
}

/**
 * Per-line-item production Gantt: solid segments from actual stage history plus
 * a faded segment projected to ETA. Data (the filtered POs + cycle-time
 * estimates) is supplied by the POs & Production page.
 */
export function ProductionTimeline({
  pos,
  estimates,
  stageLabels,
  order,
  poDrillHrefBase,
  etaSaveRouteBase,
}: {
  pos: TimelinePo[];
  estimates: Record<ProductionStage, number>;
  stageLabels: Record<ProductionStage, string>;
  order: readonly string[];
  /** When set, a track's label drills into that PO's SKU breakdown
   *  (`${base}${encodeURIComponent(poNumber)}`) instead of the PO detail page. */
  poDrillHrefBase?: string;
  /** Enables the inline stage-target editor on projected segments. Caller
   *  supplies the API base ("/api/production/po" for admin pages, or
   *  "/api/supplier/po" for the supplier portal); the component PUTs to
   *  `${base}/${poId}/stage-eta` and refreshes the page on success. */
  etaSaveRouteBase?: string;
}) {
  const router = useRouter();
  const todayIso = isoDay(new Date());
  const todayMs = utcMidnight(todayIso);

  const targetsByPoId = buildTargetsByPoId(pos);
  const onSaveEta = etaSaveRouteBase
    ? makeStageEtaSaver(etaSaveRouteBase, router)
    : null;

  const tracks = pos
    .flatMap((po) =>
      po.lineItems
        .filter((li) => li.stageEvents.length > 0)
        .map((li) => {
          const segs = buildLineSegments(
            li,
            todayMs,
            todayIso,
            order,
            estimates,
            targetsByPoId.get(po.id),
          );
          // When the caller has pre-computed per-supplier sub-bars (multi-
          // supplier master view), use those directly and derive the row's
          // ms range from their union.
          const subBars = li.subBars && li.subBars.length > 0 ? li.subBars : null;
          const allSegs = subBars ? subBars.flatMap((b) => b.segs) : segs;
          const etaMs = subBars
            ? Math.max(0, ...subBars.flatMap((b) => b.segs.filter((s) => s.projected).map((s) => s.endMs))) || null
            : segs.findLast((s) => s.projected)?.endMs ?? null;
          return {
            key: li.id,
            poId: po.id,
            poNumber: li.poNumber ?? formatPoNumber(po.shopifyPoNumber),
            supplier: li.supplierName ?? po.supplier?.name ?? "—",
            sku: li.sku,
            title: li.title,
            currentStage: li.currentStage,
            segs,
            subBars,
            startMs: allSegs.length ? Math.min(...allSegs.map((s) => s.startMs)) : todayMs,
            endMs: allSegs.length ? Math.max(...allSegs.map((s) => s.endMs)) : todayMs,
            etaMs,
          };
        }),
    )
    .sort((a, b) => skuSize(a.sku) - skuSize(b.sku) || a.startMs - b.startMs);

  const minMs = tracks.length ? Math.min(...tracks.map((t) => t.startMs), todayMs) : todayMs;
  const maxMs = tracks.length ? Math.max(...tracks.map((t) => t.endMs), todayMs) : todayMs;

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold text-zinc-900">Production timeline</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Each row is a line item across its stages. Solid = actual (from stage
        history); faded = projected to ETA using cycle-time estimates.
      </p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {order.map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className={`inline-block h-3 w-3 rounded-sm ${STAGE_BAR[s] ?? "bg-zinc-300"}`} />
            {stageLabels[s]}
          </span>
        ))}
      </div>

      {tracks.length === 0 ? (
        <Card className="mt-4 p-8 text-center text-sm text-zinc-400">
          No open line items to chart.
        </Card>
      ) : (
        <Card className="mt-4 overflow-hidden p-0">
          <div className="divide-y divide-zinc-100">
            {tracks.map((t) => {
              const drillHref = poDrillHrefBase
                ? `${poDrillHrefBase}${encodeURIComponent(t.poNumber)}`
                : undefined;
              return (
                <div
                  key={t.key}
                  className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                    drillHref ? "cursor-pointer hover:bg-zinc-50/80 active:bg-zinc-100/80" : ""
                  }`}
                  onClick={
                  drillHref
                    ? (e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        sessionStorage.setItem(DRILL_ORIGIN_KEY, String(rect.top + window.scrollY));
                        router.push(drillHref);
                      }
                    : undefined
                }
                >
                  <div className="w-48 shrink-0">
                    {/* In drill mode the row itself navigates — show label as
                        plain text to avoid nested interactives. */}
                    {drillHref ? (
                      <>
                        <span
                          className="block truncate font-mono text-xs font-medium text-zinc-900"
                          title={t.sku}
                        >
                          {t.sku}
                        </span>
                        <div className="truncate text-[11px] text-zinc-400">
                          {t.poNumber} · {t.supplier}
                        </div>
                      </>
                    ) : (
                      <>
                        <Link
                          href={`/modules/production/po/${t.poId}`}
                          className="block truncate font-mono text-xs text-zinc-900 hover:underline"
                          title={`${t.sku} — ${t.title}`}
                        >
                          {t.sku}
                        </Link>
                        <div className="truncate text-[11px] text-zinc-400">
                          {t.poNumber} · {t.supplier}
                        </div>
                      </>
                    )}
                  </div>

                  {t.subBars ? (
                    <div className="flex flex-1 flex-col gap-1">
                      {t.subBars.map((b) => (
                        // Wrap each bar in an inner horizontal flex so the
                        // TimelineBar's `flex-1` grows in the right axis.
                        // See PoExpandableTimeline for the gory details.
                        <div key={b.poId} className="flex items-center">
                          <TimelineBar
                            segs={b.segs}
                            todayMs={todayMs}
                            minMs={minMs}
                            maxMs={maxMs}
                            stageLabels={stageLabels}
                            editable={
                              onSaveEta
                                ? {
                                    targetsMs:
                                      targetsByPoId.get(b.poId) ??
                                      new Map<ProductionStage, number>(),
                                    onSave: (stage, dateIso) =>
                                      onSaveEta(b.poId, stage, dateIso),
                                  }
                                : undefined
                            }
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <TimelineBar
                      segs={t.segs}
                      todayMs={todayMs}
                      minMs={minMs}
                      maxMs={maxMs}
                      stageLabels={stageLabels}
                      editable={
                        onSaveEta
                          ? {
                              targetsMs:
                                targetsByPoId.get(t.poId) ??
                                new Map<ProductionStage, number>(),
                              onSave: (stage, dateIso) =>
                                onSaveEta(t.poId, stage, dateIso),
                            }
                          : undefined
                      }
                    />
                  )}

                  <div className="w-24 shrink-0 text-right text-xs text-zinc-500">
                    {isTerminal(order, t.currentStage)
                      ? stageLabels[t.currentStage]
                      : t.etaMs
                        ? `ETA ${fmtDate(isoDay(new Date(t.etaMs)))}`
                        : "—"}
                  </div>
                </div>
              );
            })}
          </div>

          <TimelineAxisRow minMs={minMs} maxMs={maxMs} />
        </Card>
      )}
    </div>
  );
}
