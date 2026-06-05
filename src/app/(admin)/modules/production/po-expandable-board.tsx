"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useStageLabels } from "@/components/production/stage-labels-provider";
import { STAGE_BAR } from "@/lib/production/display";
import { PoSkuBreakdown } from "./po-sku-breakdown";
import type { KanbanCard } from "./kanban/kanban-board";
import type { ProductionStage } from "@/lib/production/stages";
import type { IncomingRow } from "@/lib/production/inventory";

/**
 * By-PO Kanban board with inline SKU expansion.
 *
 * Clicking a card collapses all other cards (they fade + scale down) and
 * expands the SKU breakdown directly below the board area. No page navigation.
 */
export function PoExpandableBoard({
  cards,
  stages,
  skuRowsByPo,
  stageLabels,
}: {
  cards: KanbanCard[];
  stages: readonly ProductionStage[];
  skuRowsByPo: Record<string, IncomingRow[]>;
  stageLabels: Record<string, string>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const boardStageLabels = useStageLabels();

  const selectedCard = selected ? cards.find((c) => c.sku === selected) : null;

  function toggle(poNumber: string) {
    setSelected((prev) => (prev === poNumber ? null : poNumber));
  }

  const byStage = (stage: ProductionStage) =>
    cards.filter((c) => c.stage === stage);

  return (
    <div>
      {/* Board */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const items = byStage(stage);
          return (
            <div
              key={stage}
              className="flex w-64 shrink-0 flex-col rounded-xl border border-zinc-200/80 bg-zinc-50/60"
            >
              <div className="flex items-center justify-between border-b border-zinc-200/80 px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  {boardStageLabels[stage]}
                </span>
                <span className="text-xs text-zinc-400">{items.length}</span>
              </div>

              <div className="flex flex-1 flex-col gap-2 p-2">
                {items.map((c) => {
                  const isSelected = selected === c.sku;
                  const isCollapsed = selected !== null && !isSelected;

                  return (
                    <div
                      key={c.id}
                      style={{
                        display: "grid",
                        gridTemplateRows: isCollapsed ? "0fr" : "1fr",
                        opacity: isCollapsed ? 0 : 1,
                        transition:
                          "grid-template-rows 280ms cubic-bezier(0.16,1,0.3,1), opacity 200ms ease",
                      }}
                    >
                      <div style={{ overflow: "hidden", minHeight: 0 }}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => toggle(c.sku)}
                          onKeyDown={(e) => e.key === "Enter" && toggle(c.sku)}
                          className={cn(
                            "cursor-pointer rounded-lg border p-2.5 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-all",
                            isSelected
                              ? "border-zinc-900 bg-zinc-900 shadow-none"
                              : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm",
                          )}
                        >
                          <div className="font-mono text-xs font-medium">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1",
                                isSelected ? "text-zinc-100" : "text-zinc-700",
                              )}
                            >
                              <span
                                className={cn(
                                  "h-2 w-2 rounded-sm",
                                  STAGE_BAR[stage] ?? "bg-zinc-300",
                                )}
                              />
                              {c.sku}
                            </span>
                          </div>
                          <div
                            className={cn(
                              "mt-1 text-sm",
                              isSelected ? "text-zinc-200" : "text-zinc-900",
                            )}
                          >
                            {c.title}
                          </div>
                          <div
                            className={cn(
                              "mt-1.5 flex items-center justify-between text-xs",
                              isSelected ? "text-zinc-400" : "text-zinc-400",
                            )}
                          >
                            <Link
                              href={`/modules/production/po/${c.poId}`}
                              className="underline decoration-zinc-500 underline-offset-2 hover:text-zinc-200"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {c.poNumber}
                            </Link>
                            <span>×{c.quantity}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {items.length === 0 && (
                  <div className="px-2 py-6 text-center text-xs text-zinc-300">
                    —
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Inline SKU breakdown below the board */}
      {selectedCard && (
        <div className="mt-4">
          <PoSkuBreakdown
            key={selected!}
            poNumber={selectedCard.poNumber}
            poId={selectedCard.poId}
            supplier={selectedCard.supplier}
            rows={skuRowsByPo[selectedCard.sku] ?? []}
            stageLabels={stageLabels}
            onClose={() => setSelected(null)}
          />
        </div>
      )}
    </div>
  );
}
