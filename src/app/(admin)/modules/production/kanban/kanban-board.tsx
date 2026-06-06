"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { STAGES, type ProductionStage } from "@/lib/production/stages";
import { useStageLabels } from "@/components/production/stage-labels-provider";
import { skuSize } from "@/lib/production/display";
import { cn } from "@/lib/utils";
import { DRILL_ORIGIN_KEY } from "../drill-panel";

export interface KanbanCard {
  id: string;
  sku: string;
  title: string;
  quantity: number;
  stage: ProductionStage;
  poId: string;
  poNumber: string;
  supplier: string;
  locked: boolean;
  /** Line item ids that currently sit at the card's `stage`. Set on aggregated
   * cards (sub-PO rollups) so dragging the card calls the stage-advance API
   * for each id — bulk-advance all the work this card represents at its
   * current stage to the drop target. Undefined for cards that represent a
   * single line item (id IS the line item id then) or rollups we don't want
   * draggable (e.g. master cards). */
  lineItemIdsAtStage?: string[];
}

export function KanbanBoard({
  cards,
  stages = STAGES,
  poHrefBase = "/modules/production/po",
  readOnly = false,
  poDrillHrefBase,
}: {
  cards: KanbanCard[];
  /** Columns to render (defaults to every stage). The supplier portal passes a
   *  scoped subset — their owned stages + the handoff target. */
  stages?: readonly ProductionStage[];
  /** Base path for the per-card PO link (suppliers use /supplier/po). */
  poHrefBase?: string;
  /** When true, cards are a static overview (no drag-to-advance). The "By PO"
   *  view uses this — a card is a whole PO, not a single movable line. */
  readOnly?: boolean;
  /** When set, the card's PO link drills into that PO's SKU breakdown
   *  (`${base}${encodeURIComponent(poNumber)}`) instead of the PO detail page. */
  poDrillHrefBase?: string;
}) {
  const router = useRouter();
  const stageLabels = useStageLabels();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<ProductionStage | null>(null);

  async function move(cardId: string, toStage: ProductionStage) {
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.stage === toStage) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/production/line-items/${cardId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: toStage }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Move failed.");
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
    cards
      .filter((c) => c.stage === stage)
      .sort((a, b) => skuSize(a.sku) - skuSize(b.sku) || a.sku.localeCompare(b.sku));

  return (
    <div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className={cn("flex gap-3 overflow-x-auto pb-4", busy && "opacity-60")}>
        {stages.map((stage) => {
          const items = byStage(stage);
          return (
            <div
              key={stage}
              onDragOver={
                readOnly
                  ? undefined
                  : (e) => {
                      e.preventDefault();
                      setOverStage(stage);
                    }
              }
              onDragLeave={
                readOnly
                  ? undefined
                  : () => setOverStage((s) => (s === stage ? null : s))
              }
              onDrop={
                readOnly
                  ? undefined
                  : (e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain");
                      setOverStage(null);
                      setDragId(null);
                      if (id) move(id, stage);
                    }
              }
              className={cn(
                "flex w-64 shrink-0 flex-col rounded-xl border border-zinc-200/80 bg-zinc-50/60",
                overStage === stage && "border-zinc-400 bg-zinc-100",
              )}
            >
              <div className="flex items-center justify-between border-b border-zinc-200/80 px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  {stageLabels[stage]}
                </span>
                <span className="text-xs text-zinc-400">{items.length}</span>
              </div>

              <div className="flex flex-1 flex-col gap-2 p-2">
                {items.map((c) => (
                  <div
                    key={c.id}
                    draggable={!busy && !readOnly}
                    onDragStart={
                      readOnly
                        ? undefined
                        : (e) => {
                            e.dataTransfer.setData("text/plain", c.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDragId(c.id);
                          }
                    }
                    onDragEnd={
                      readOnly
                        ? undefined
                        : () => {
                            setDragId(null);
                            setOverStage(null);
                          }
                    }
                    onClick={
                      poDrillHrefBase
                        ? (e) => {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            sessionStorage.setItem(DRILL_ORIGIN_KEY, String(rect.top + window.scrollY));
                            router.push(`${poDrillHrefBase}${encodeURIComponent(c.poNumber)}`);
                          }
                        : undefined
                    }
                    className={cn(
                      "rounded-lg border border-zinc-200 bg-white p-2.5 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-[border-color,box-shadow]",
                      poDrillHrefBase
                        ? "cursor-pointer hover:border-zinc-400 hover:shadow-md"
                        : readOnly
                          ? ""
                          : "cursor-grab active:cursor-grabbing",
                      dragId === c.id && "opacity-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-xs text-zinc-700">{c.sku}</span>
                      {c.locked && (
                        <Lock
                          className="h-3 w-3 shrink-0 text-zinc-400"
                          aria-label="Locked PO — moving this moves the whole PO"
                        />
                      )}
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm text-zinc-900">
                      {c.title}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-zinc-400">
                      {/* In drill mode the whole card is the click target — show
                          the PO number as plain text to avoid nested interactives. */}
                      {poDrillHrefBase ? (
                        <span>{c.poNumber}</span>
                      ) : (
                        <Link
                          href={`${poHrefBase}/${c.poId}`}
                          className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-600"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.poNumber}
                        </Link>
                      )}
                      <span>×{c.quantity}</span>
                    </div>
                    <div className="truncate text-xs text-zinc-400">{c.supplier}</div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="px-2 py-6 text-center text-xs text-zinc-300">—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
