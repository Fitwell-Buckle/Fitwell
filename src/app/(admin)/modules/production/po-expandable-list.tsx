"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/production/display";
import { Mono } from "@/components/ui/data-table";
import { PoSkuBreakdown } from "./po-sku-breakdown";
import type { IncomingPoRow, IncomingRow } from "@/lib/production/inventory";

/**
 * Expandable "by PO" inventory list.
 *
 * Clicking a row collapses all other rows (height + opacity animation) and
 * expands the SKU breakdown inline below the selected row — no page navigation.
 * Clicking the same row again (or "← Back") collapses the breakdown.
 *
 * The CSS grid-template-rows trick gives a smooth height collapse without
 * needing known element heights.
 */
export function PoExpandableList({
  rows,
  skuRowsByPo,
  stageLabels,
}: {
  rows: IncomingPoRow[];
  /** Pre-computed SKU rows per PO number, from the server. */
  skuRowsByPo: Record<string, IncomingRow[]>;
  stageLabels: Record<string, string>;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  function toggle(poNumber: string) {
    setSelected((prev) => (prev === poNumber ? null : poNumber));
  }

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-zinc-400">
        Nothing in production matches.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200">
      {/* Column header — column widths must mirror the data row below. */}
      <div className="flex items-center gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        <div className="w-36 shrink-0">PO #</div>
        <div className="w-36 shrink-0">Supplier</div>
        <div className="w-24 shrink-0 text-right">Incoming</div>
        <div className="min-w-0 flex-1">By stage</div>
        <div className="w-24 shrink-0 text-right">Nearest ETA</div>
        {/* Placeholder matching the row's chevron (h-4 w-4 + ml-1) */}
        <div className="ml-1 h-4 w-4 shrink-0" aria-hidden />
      </div>

      {rows.map((r, i) => {
        const isSelected = selected === r.poNumber;
        const isCollapsed = selected !== null && !isSelected;

        return (
          <div
            key={r.poNumber}
            style={{
              // grid-template-rows is the cleanest CSS trick for height collapse:
              // 0fr = content collapses to 0; 1fr = content takes natural height.
              display: "grid",
              gridTemplateRows: isCollapsed ? "0fr" : "1fr",
              opacity: isCollapsed ? 0 : 1,
              transition:
                "grid-template-rows 300ms cubic-bezier(0.16,1,0.3,1), opacity 220ms ease",
            }}
          >
            {/* Inner wrapper must have overflow:hidden for grid collapse to work */}
            <div style={{ overflow: "hidden", minHeight: 0 }}>
              {/* Divider (skip first row) */}
              {i > 0 && (
                <div className={cn("border-t border-zinc-100", isSelected && "border-transparent")} />
              )}

              {/* Row */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggle(r.poNumber)}
                onKeyDown={(e) => e.key === "Enter" && toggle(r.poNumber)}
                className={cn(
                  "group flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors",
                  isSelected
                    ? "bg-brand text-white"
                    : "hover:bg-zinc-50 active:bg-zinc-100",
                )}
              >
                {/* PO # */}
                <div className="w-36 shrink-0 font-mono text-sm font-medium">
                  {r.poNumber}
                </div>
                {/* Supplier */}
                <div className={cn("w-36 shrink-0 text-sm", isSelected ? "text-zinc-300" : "text-zinc-700")}>
                  {r.supplier}
                </div>
                {/* Qty */}
                <div className={cn("w-24 shrink-0 text-right text-sm font-medium", isSelected ? "text-white" : "text-zinc-900")}>
                  {r.incomingQty}
                </div>
                {/* Stage pills */}
                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {Object.entries(r.byStage).map(([stg, qty]) => (
                    <span
                      key={stg}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs",
                        isSelected
                          ? "bg-zinc-700 text-zinc-200"
                          : "bg-zinc-100 text-zinc-600",
                      )}
                    >
                      {stageLabels[stg] ?? stg}: {qty}
                    </span>
                  ))}
                </div>
                {/* ETA */}
                <div className={cn("w-24 shrink-0 text-right text-sm", isSelected ? "text-zinc-300" : "text-zinc-500")}>
                  {fmtDate(r.nearestEta)}
                </div>
                {/* Expand chevron */}
                <div className="ml-1 shrink-0">
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-300",
                      isSelected
                        ? "rotate-180 text-zinc-300"
                        : "text-zinc-300 group-hover:text-zinc-400",
                    )}
                  />
                </div>
              </div>

              {/* Inline SKU breakdown (only rendered when selected) */}
              {isSelected && (
                <PoSkuBreakdown
                  poNumber={r.poNumber}
                  poId={r.poId}
                  supplier={r.supplier}
                  rows={skuRowsByPo[r.poNumber] ?? []}
                  stageLabels={stageLabels}
                  onClose={() => setSelected(null)}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
