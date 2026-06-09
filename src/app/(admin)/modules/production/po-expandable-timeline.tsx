"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { isTerminal, type ProductionStage } from "@/lib/production/stages";
import { STAGE_BAR, fmtDate } from "@/lib/production/display";
import { PoSkuBreakdown } from "./po-sku-breakdown";
import {
  buildLineSegments,
  buildTargetsByPoId,
  makeStageEtaSaver,
  TimelineAxisRow,
  TimelineBar,
  type TimelinePo,
} from "@/components/production/production-timeline";
import type { IncomingRow } from "@/lib/production/inventory";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * By-PO Timeline with inline SKU expansion.
 *
 * Clicking a track collapses all other tracks (height grid trick) and
 * expands the SKU breakdown below the selected track. No page navigation.
 */
export function PoExpandableTimeline({
  pos,
  estimates,
  stageLabels,
  order,
  skuRowsByPo,
  etaSaveRouteBase,
}: {
  pos: TimelinePo[];
  estimates: Record<ProductionStage, number>;
  stageLabels: Record<ProductionStage, string>;
  order: readonly string[];
  skuRowsByPo: Record<string, IncomingRow[]>;
  /** When set, enables the inline stage-target editor — see
   *  ProductionTimeline.etaSaveRouteBase. */
  etaSaveRouteBase?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const router = useRouter();

  const todayIso = isoDay(new Date());
  const todayMs = Date.parse(`${todayIso}T00:00:00Z`);

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
          const subBars = li.subBars && li.subBars.length > 0 ? li.subBars : null;
          const allSegs = subBars ? subBars.flatMap((b) => b.segs) : segs;
          const etaMs = subBars
            ? Math.max(0, ...subBars.flatMap((b) => b.segs.filter((s) => s.projected).map((s) => s.endMs))) || null
            : segs.findLast((s) => s.projected)?.endMs ?? null;
          return {
            key: li.id,
            poId: po.id,
            poNumber: li.poNumber ?? li.sku,
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
    .sort((a, b) => a.startMs - b.startMs);

  const minMs = tracks.length
    ? Math.min(...tracks.map((t) => t.startMs), todayMs)
    : todayMs;
  const maxMs = tracks.length
    ? Math.max(...tracks.map((t) => t.endMs), todayMs)
    : todayMs;

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold text-zinc-900">Production timeline</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Click a track to expand its SKU breakdown.
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
              const isSelected = selected === t.poNumber;
              const isCollapsed = selected !== null && !isSelected;

              return (
                <div
                  key={t.key}
                  style={{
                    display: "grid",
                    gridTemplateRows: isCollapsed ? "0fr" : "1fr",
                    opacity: isCollapsed ? 0 : 1,
                    transition:
                      "grid-template-rows 300ms cubic-bezier(0.16,1,0.3,1), opacity 220ms ease",
                  }}
                >
                  <div style={{ overflow: "hidden", minHeight: 0 }}>
                    {/* Track header — PO label + ETA. Stays at the top in
                        every state (clickable to collapse when expanded).
                        Renders the bar inline only when this track is NOT
                        expanded; when expanded the bar drops to its own row
                        at the bottom of the expansion, flush above the date
                        axis. */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setSelected((p) => (p === t.poNumber ? null : t.poNumber))
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        setSelected((p) => (p === t.poNumber ? null : t.poNumber))
                      }
                      className={cn(
                        "flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors",
                        isSelected ? "bg-brand" : "hover:bg-zinc-50/80",
                      )}
                    >
                      <div className="w-48 shrink-0">
                        <div
                          className={cn(
                            "block truncate font-mono text-xs font-medium",
                            isSelected ? "text-zinc-100" : "text-zinc-900",
                          )}
                          title={`${t.sku} — ${t.title}`}
                        >
                          {t.sku}
                        </div>
                        {t.subBars ? (
                          // Multi-supplier: stack each supplier's name
                          // aligned to its bar on the right. Each row is
                          // h-6 (24px) to match the bar row height; the
                          // mt-1 + gap-1 align with the bar stack which
                          // has the same vertical rhythm.
                          <div className="mt-1 flex flex-col gap-1">
                            {t.subBars.map((b) => (
                              <div
                                key={b.poId}
                                className={cn(
                                  "flex h-6 items-center truncate text-[11px]",
                                  isSelected ? "text-zinc-400" : "text-zinc-500",
                                )}
                              >
                                {b.supplierName}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div
                            className={cn(
                              "truncate text-[11px]",
                              isSelected ? "text-zinc-400" : "text-zinc-400",
                            )}
                          >
                            {t.poNumber} · {t.supplier}
                          </div>
                        )}
                      </div>

                      {isSelected ? (
                        // Spacer so the ETA cell stays right-aligned while
                        // the bar is rendered at the bottom of the expansion.
                        <div className="flex-1" />
                      ) : t.subBars ? (
                        <div className="flex flex-1 flex-col">
                          {/* Invisible top spacer matches the label cell's
                              PO# row + mt-1 (~text-xs leading + 4px) so the
                              bar rows below align horizontally with each
                              supplier name in the label. */}
                          <div aria-hidden className="h-4" />
                          <div className="mt-1 flex flex-col gap-1">
                            {t.subBars.map((b) => (
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

                      <div
                        className={cn(
                          "w-24 shrink-0 text-right text-xs",
                          isSelected ? "text-zinc-400" : "text-zinc-500",
                        )}
                      >
                        {isTerminal(order, t.currentStage)
                          ? stageLabels[t.currentStage]
                          : t.etaMs
                            ? `ETA ${fmtDate(isoDay(new Date(t.etaMs)))}`
                            : "—"}
                      </div>
                    </div>

                    {/* Inline SKU breakdown */}
                    {isSelected && (
                      <PoSkuBreakdown
                        key={selected!}
                        poNumber={t.poNumber}
                        poId={t.poId}
                        supplier={t.supplier}
                        rows={skuRowsByPo[t.poNumber] ?? []}
                        stageLabels={stageLabels}
                        onClose={() => setSelected(null)}
                      />
                    )}

                    {/* Bar row (expanded only) — aligned to the same gutters
                        as the track header above so the segments line up
                        with the date axis below all tracks. Multi-supplier
                        masters get a stack, one bar per supplier. */}
                    {isSelected && (
                      <div className="flex items-center gap-3 border-t border-zinc-100 px-4 py-2.5">
                        <div className="w-48 shrink-0" />
                        {t.subBars ? (
                          <div className="flex flex-1 flex-col gap-1">
                            {t.subBars.map((b) => (
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
                        <div className="w-24 shrink-0" />
                      </div>
                    )}
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
