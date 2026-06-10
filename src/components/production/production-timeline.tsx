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
      {/* Today indicator: a single bold vertical line through the whole
        *  row. With segments rendered at full opacity + full height (no
        *  fade or half-height for projected), this is the only past-vs-
        *  future visual cue. */}
      <div
        className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-zinc-900/70"
        style={{ left: `${pct(todayMs)}%` }}
        title={`Today · ${fmtDate(isoDay(new Date(todayMs)))}`}
      />
      {segs.map((s, i) => {
        const startLabel = fmtDate(isoDay(new Date(s.startMs)));
        const endLabel = fmtDate(isoDay(new Date(s.endMs)));
        const span =
          startLabel === endLabel ? startLabel : `${startLabel} → ${endLabel}`;
        const hasOverride = !!editable?.targetsMs.has(s.stage);
        const editableSeg = !!editable && s.projected;
        const tip = `${stageLabels[s.stage]} · ${span}${
          hasOverride ? " · target set" : ""
        }${editableSeg ? " · click to edit" : ""}`;
        const style = {
          left: `${pct(s.startMs)}%`,
          width: `${Math.max(pct(s.endMs) - pct(s.startMs), 0.5)}%`,
        };
        // Every segment renders full-height + full-color. The today line
        // does the past/future job; bars no longer fade or shrink.
        const colorClass = STAGE_BAR[s.stage] ?? "bg-zinc-300";
        return editableSeg ? (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openEditor(s.stage, s.endMs);
            }}
            className={`absolute top-1 h-4 rounded-sm border-0 p-0 ${colorClass} cursor-pointer hover:ring-2 hover:ring-zinc-900/40`}
            style={style}
            title={tip}
          />
        ) : (
          <div
            key={i}
            className={`absolute top-1 h-4 rounded-sm ${colorClass}`}
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
  /** Per-PO per-stage day estimates. When set, the legend's click-to-edit
   *  shows this value pre-filled instead of the global rolling average.
   *  Persistence is handled by the caller via `estimateSaveRouteBase`. */
  stageEstimates?: { stage: ProductionStage; days: number }[];
  lineItems: {
    id: string;
    sku: string;
    title: string;
    currentStage: ProductionStage;
    /** Per-line stage list — when set, the projected segment chain walks THIS
     *  list instead of the global `order` (so a line that skips EDM/polishing
     *  doesn't get phantom segments for them). NULL/undefined = inherit `order`. */
    stages?: readonly string[] | null;
    /** Per-line stage target overrides. When set, these override the PO-level
     *  `stageTargets` for THIS line's segment projection — so a line whose
     *  ETA is 06/29 ends at 06/29 even if another line on the same PO has a
     *  later ETA. Used by the supplier portal's per-line ETA anchoring. */
    stageTargets?: { stage: ProductionStage; targetEndDate: string }[];
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
  estimateSaveRouteBase,
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
  /** Enables click-to-edit on each legend chip. PUT to
   *  `${base}/${pos[0].id}/stage-estimate` with `{ stage, days }`. Reuses
   *  the same admin / supplier split as `etaSaveRouteBase`. */
  estimateSaveRouteBase?: string;
}) {
  const router = useRouter();
  const todayIso = isoDay(new Date());
  const todayMs = utcMidnight(todayIso);

  const targetsByPoId = buildTargetsByPoId(pos);
  const onSaveEta = etaSaveRouteBase
    ? makeStageEtaSaver(etaSaveRouteBase, router)
    : null;
  // Per-PO stage estimates merged in for the legend pre-fill. We assume one
  // PO at a time on pages that pass estimateSaveRouteBase (admin sub-PO,
  // supplier portal) — the by-PO admin view uses the same prop on each
  // expanded row but we only show the FIRST PO's overrides; fine since the
  // legend collapses to global stages anyway when multiple POs share it.
  const stageEstimatesByPo = new Map<string, Map<ProductionStage, number>>();
  for (const po of pos) {
    const m = new Map<ProductionStage, number>();
    for (const e of po.stageEstimates ?? []) m.set(e.stage, e.days);
    stageEstimatesByPo.set(po.id, m);
  }

  const tracks = pos
    .flatMap((po) =>
      po.lineItems
        .filter((li) => li.stageEvents.length > 0)
        .map((li) => {
          // Per-line overrides win: a line with its own ETA gets a target
          // map built from its `stageTargets`, ignoring the PO-level map.
          // Otherwise we fall back to the PO-level targets so the by-PO
          // and admin master views keep their existing behavior.
          const lineTargets =
            li.stageTargets && li.stageTargets.length > 0
              ? new Map(
                  li.stageTargets.map(
                    (t) => [t.stage, utcMidnight(t.targetEndDate)] as const,
                  ),
                )
              : targetsByPoId.get(po.id);
          // Merge per-PO estimate overrides on top of the global estimates.
          // Each PO can carry its own "stamping = 30 days" override via the
          // legend's click-to-edit; that only affects this PO's projections.
          const poEstimateMap = stageEstimatesByPo.get(po.id);
          const effectiveEstimates: Record<ProductionStage, number> =
            poEstimateMap && poEstimateMap.size > 0
              ? { ...estimates, ...Object.fromEntries(poEstimateMap) }
              : estimates;
          const segs = buildLineSegments(
            li,
            todayMs,
            todayIso,
            order,
            effectiveEstimates,
            lineTargets,
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

  // Legend: only the stages this PO actually walks. If any line inherits the
  // global pipeline (stages == null/[]) we fall back to the full order so the
  // legend isn't surprised by future lines; when every line opts into an
  // explicit subset, the legend collapses to the union of those subsets.
  const visibleStagesSet = new Set<ProductionStage>();
  let anyInherits = false;
  for (const po of pos) {
    for (const li of po.lineItems) {
      if (!li.stages || li.stages.length === 0) {
        anyInherits = true;
      } else {
        for (const s of li.stages) visibleStagesSet.add(s);
      }
    }
  }
  const legendStages = anyInherits
    ? order
    : order.filter((s) => visibleStagesSet.has(s));

  // Legend click-to-edit: when `estimateSaveRouteBase` is set AND we're on a
  // single-PO view (admin sub-PO detail, supplier portal), each chip becomes
  // a button that opens a number input. Override persists per (po, stage).
  const singlePo = pos.length === 1 ? pos[0] : null;
  const onSaveEstimate =
    estimateSaveRouteBase && singlePo
      ? async (stage: ProductionStage, days: number | null) => {
          const res = await fetch(
            `${estimateSaveRouteBase}/${encodeURIComponent(singlePo.id)}/stage-estimate`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ stage, days }),
            },
          );
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Couldn't update the estimate.");
          }
          router.refresh();
        }
      : null;
  const poEstimateMapForLegend = singlePo
    ? stageEstimatesByPo.get(singlePo.id) ?? new Map<ProductionStage, number>()
    : null;

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold text-zinc-900">Production timeline</h2>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {legendStages.map((s) =>
          onSaveEstimate && poEstimateMapForLegend ? (
            <LegendChip
              key={s}
              stage={s}
              label={stageLabels[s]}
              colorClass={STAGE_BAR[s] ?? "bg-zinc-300"}
              currentDays={poEstimateMapForLegend.get(s) ?? estimates[s] ?? 0}
              isOverride={poEstimateMapForLegend.has(s)}
              onSave={(days) => onSaveEstimate(s, days)}
            />
          ) : (
            <span key={s} className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span className={`inline-block h-3 w-3 rounded-sm ${STAGE_BAR[s] ?? "bg-zinc-300"}`} />
              {stageLabels[s]}
            </span>
          ),
        )}
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

/**
 * Legend chip that becomes an inline number editor on click. Shows the
 * stage's current per-PO day estimate (or the global rolling-avg when no
 * override exists) and lets the caller upsert a new value. A small dot
 * appears next to the label when an override is in effect, so it's
 * obvious which stages this PO has customized.
 */
function LegendChip({
  stage,
  label,
  colorClass,
  currentDays,
  isOverride,
  onSave,
}: {
  stage: ProductionStage;
  label: string;
  colorClass: string;
  currentDays: number;
  isOverride: boolean;
  onSave: (days: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(currentDays));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit(action: "save" | "clear") {
    setBusy(true);
    setError(null);
    try {
      if (action === "clear") {
        await onSave(null);
      } else {
        const n = Number(draft);
        if (!Number.isInteger(n) || n < 0 || n > 3650) {
          throw new Error("Days must be a whole number between 0 and 3650.");
        }
        await onSave(n);
      }
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs">
        <span className={`inline-block h-3 w-3 rounded-sm ${colorClass}`} />
        <span className="text-zinc-700">{label}</span>
        <input
          type="number"
          min={0}
          max={3650}
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit("save");
            if (e.key === "Escape") setEditing(false);
          }}
          autoFocus
          className="h-5 w-14 rounded border border-zinc-200 bg-white px-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300"
        />
        <span className="text-zinc-500">days</span>
        <button
          type="button"
          onClick={() => commit("save")}
          disabled={busy}
          className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium text-white disabled:opacity-50"
        >
          {busy ? "…" : "Save"}
        </button>
        {isOverride && (
          <button
            type="button"
            onClick={() => commit("clear")}
            disabled={busy}
            className="text-[10px] text-zinc-500 underline underline-offset-2 hover:text-zinc-900 disabled:opacity-50"
            title="Revert to global average"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={busy}
          className="text-[10px] text-zinc-400 hover:text-zinc-900 disabled:opacity-50"
        >
          ×
        </button>
        {error && <span className="text-[10px] text-red-600">{error}</span>}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(String(currentDays));
        setError(null);
        setEditing(true);
      }}
      className="flex items-center gap-1.5 rounded-md border border-transparent px-1 py-0.5 text-xs text-zinc-500 hover:border-zinc-200 hover:bg-white"
      title={`${label} — ${currentDays} days${isOverride ? " (per-PO override)" : ""}. Click to edit.`}
    >
      <span className={`inline-block h-3 w-3 rounded-sm ${colorClass}`} />
      <span>{label}</span>
      {isOverride && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
    </button>
  );
}
