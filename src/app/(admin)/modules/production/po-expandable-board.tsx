"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
 *
 * Cards that carry `lineItemIdsAtStage` (the sub-PO rollup) are draggable —
 * dropping a sub-PO card on a different stage column calls the stage-advance
 * API for every line item at the card's current stage. Cards without that
 * field (e.g. master rollups) stay click-to-expand only.
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
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<ProductionStage | null>(null);
  const boardStageLabels = useStageLabels();

  const selectedCard = selected ? cards.find((c) => c.sku === selected) : null;

  function toggle(poNumber: string) {
    setSelected((prev) => (prev === poNumber ? null : poNumber));
  }

  // Bulk-advance: walk the card's `lineItemIdsAtStage` and POST a stage
  // change for each in parallel. The endpoint is the same one the per-line
  // KanbanBoard uses, so server-side validation (locks, stage order) applies
  // unchanged.
  async function moveCard(card: KanbanCard, toStage: ProductionStage) {
    if (!card.lineItemIdsAtStage?.length || card.stage === toStage) return;
    setBusy(true);
    setError(null);
    try {
      const results = await Promise.all(
        card.lineItemIdsAtStage.map((id) =>
          fetch(`/api/production/line-items/${id}/stage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stage: toStage }),
          }).then(async (res) => ({
            ok: res.ok,
            body: (await res.json().catch(() => ({}))) as { error?: string },
          })),
        ),
      );
      const failures = results.filter((r) => !r.ok);
      if (failures.length > 0) {
        setError(
          failures[0].body.error ??
            `${failures.length} of ${results.length} moves failed.`,
        );
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const byStage = (stage: ProductionStage) =>
    cards.filter((c) => c.stage === stage);

  return (
    <div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {/* Board */}
      <div
        className={cn(
          "flex gap-3 overflow-x-auto pb-4",
          busy && "opacity-60",
        )}
      >
        {stages.map((stage) => {
          const items = byStage(stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setOverStage(stage);
              }}
              onDragLeave={() =>
                setOverStage((s) => (s === stage ? null : s))
              }
              onDrop={(e) => {
                if (!dragId) return;
                e.preventDefault();
                const card = cards.find((c) => c.id === dragId);
                setDragId(null);
                setOverStage(null);
                if (card) void moveCard(card, stage);
              }}
              className={cn(
                "flex w-64 shrink-0 flex-col rounded-xl border border-zinc-200/80 bg-zinc-50/60",
                overStage === stage && "border-zinc-400 bg-zinc-100",
              )}
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
                          draggable={!busy && !!c.lineItemIdsAtStage?.length}
                          onDragStart={(e) => {
                            if (!c.lineItemIdsAtStage?.length) return;
                            e.dataTransfer.setData("text/plain", c.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDragId(c.id);
                          }}
                          onDragEnd={() => {
                            setDragId(null);
                            setOverStage(null);
                          }}
                          onClick={() => toggle(c.sku)}
                          onKeyDown={(e) => e.key === "Enter" && toggle(c.sku)}
                          className={cn(
                            "rounded-lg border p-2.5 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-all",
                            isSelected
                              ? "border-brand bg-brand shadow-none cursor-pointer"
                              : c.lineItemIdsAtStage?.length
                                ? "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm cursor-grab active:cursor-grabbing"
                                : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm cursor-pointer",
                            dragId === c.id && "opacity-50",
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
                              "mt-1.5 flex items-end justify-between text-xs",
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
                            {/* qty is the PO's full incoming quantity (not the
                                SKU-filtered slice) — label it "total" so the
                                number doesn't get misread as a filter result. */}
                            <div className="text-right leading-none">
                              <div>×{c.quantity.toLocaleString()}</div>
                              <div className="mt-0.5 text-[10px] uppercase tracking-wider">
                                total
                              </div>
                            </div>
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
