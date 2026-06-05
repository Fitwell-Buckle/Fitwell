"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { isTerminal, type ProductionStage } from "@/lib/production/stages";
import { STAGE_BAR, fmtDate } from "@/lib/production/display";
import { projectEta } from "@/lib/production/cycle-time";
import { PoSkuBreakdown } from "./po-sku-breakdown";
import type { TimelinePo } from "./production-timeline";
import type { IncomingRow } from "@/lib/production/inventory";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const utcMidnight = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

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
}: {
  pos: TimelinePo[];
  estimates: Record<ProductionStage, number>;
  stageLabels: Record<ProductionStage, string>;
  order: readonly string[];
  skuRowsByPo: Record<string, IncomingRow[]>;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const todayIso = isoDay(new Date());
  const todayMs = utcMidnight(todayIso);

  interface Segment {
    stage: ProductionStage;
    startMs: number;
    endMs: number;
    projected: boolean;
  }

  const tracks = pos
    .flatMap((po) =>
      po.lineItems
        .filter((li) => li.stageEvents.length > 0)
        .map((li) => {
          const segs: Segment[] = li.stageEvents.map((ev) => ({
            stage: ev.stage,
            startMs: ev.enteredAt.getTime(),
            endMs: ev.exitedAt
              ? ev.exitedAt.getTime()
              : todayMs,
            projected: false,
          }));
          segs.forEach((s) => {
            s.endMs = Math.max(s.endMs, s.startMs + MS_PER_DAY / 4);
          });

          let etaMs: number | null = null;
          if (!isTerminal(order, li.currentStage)) {
            etaMs = utcMidnight(
              projectEta(order, li.currentStage, todayIso, estimates),
            );
            if (etaMs > todayMs) {
              segs.push({
                stage: li.currentStage,
                startMs: todayMs,
                endMs: etaMs,
                projected: true,
              });
            }
          }

          return {
            key: li.id,
            poId: po.id,
            poNumber: li.poNumber ?? li.sku,
            supplier: li.supplierName ?? po.supplier?.name ?? "—",
            sku: li.sku,
            title: li.title,
            currentStage: li.currentStage,
            segs,
            startMs: segs[0].startMs,
            endMs: Math.max(...segs.map((s) => s.endMs)),
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
  const range = Math.max(maxMs - minMs, MS_PER_DAY);
  const pct = (ms: number) => ((ms - minMs) / range) * 100;
  const todayPct = pct(todayMs);

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
                    {/* Track row */}
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
                        isSelected ? "bg-zinc-900" : "hover:bg-zinc-50/80",
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
                        <div
                          className={cn(
                            "truncate text-[11px]",
                            isSelected ? "text-zinc-400" : "text-zinc-400",
                          )}
                        >
                          {t.poNumber} · {t.supplier}
                        </div>
                      </div>

                      <div className="relative h-6 flex-1 rounded bg-zinc-50">
                        <div
                          className="absolute top-0 z-10 h-full w-px bg-zinc-300"
                          style={{ left: `${todayPct}%` }}
                        />
                        {t.segs.map((s, i) => (
                          <div
                            key={i}
                            className={`absolute top-1 h-4 rounded-sm ${STAGE_BAR[s.stage] ?? "bg-zinc-300"} ${s.projected ? "opacity-30" : ""}`}
                            style={{
                              left: `${pct(s.startMs)}%`,
                              width: `${Math.max(pct(s.endMs) - pct(s.startMs), 0.5)}%`,
                            }}
                            title={`${stageLabels[s.stage]}${s.projected ? " (projected)" : ""}`}
                          />
                        ))}
                      </div>

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
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
