"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/production/display";
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
  subtitles,
  subRowsByPoNumber,
}: {
  rows: IncomingPoRow[];
  /** Pre-computed SKU rows per PO number, from the server. */
  skuRowsByPo: Record<string, IncomingRow[]>;
  stageLabels: Record<string, string>;
  /** Optional small chip rendered under the PO# cell — used by Master
   * grouping for the "0/2 sent" / "Sent ✓" indicator. Key = row's poNumber. */
  subtitles?: Record<string, React.ReactNode>;
  /** Optional nested rows per outer row — used by Master grouping to cascade
   * into a sub-PO list. When a row's poNumber maps to a non-empty array, the
   * expansion renders another PoExpandableList of those sub-rows (which in
   * turn cascade to the SKU breakdown). Falls back to the SKU breakdown
   * panel otherwise. */
  subRowsByPoNumber?: Record<string, IncomingPoRow[]>;
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
        <div className="w-32 shrink-0">Supplier</div>
        <div className="w-36 shrink-0">Collections</div>
        <div className="w-32 shrink-0">Customer</div>
        <div className="w-16 shrink-0 text-right">Items</div>
        <div className="min-w-0 flex-1">Stage</div>
        <div className="w-24 shrink-0 text-right">Final ETA</div>
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
                  {subtitles?.[r.poNumber] != null && (
                    <div
                      className={cn(
                        "mt-0.5 font-sans text-xs",
                        isSelected ? "text-zinc-300" : "text-zinc-500",
                      )}
                    >
                      {subtitles[r.poNumber]}
                    </div>
                  )}
                  {/* Open-PO link, right under the row's banner. Label adapts:
                      a master row opens the master, a sub-PO row its sub-PO. */}
                  {isSelected && (
                    <a
                      href={`/modules/production/po/${r.poId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 block font-sans text-xs text-zinc-300 underline decoration-zinc-400 underline-offset-2 hover:text-white"
                    >
                      {subRowsByPoNumber?.[r.poNumber]?.length
                        ? "Open Master PO"
                        : r.masterPoId
                          ? "Open Sub PO"
                          : "Open PO"}{" "}
                      →
                    </a>
                  )}
                </div>
                {/* Supplier(s) — a master lists every involved supplier */}
                <div className={cn("w-32 shrink-0 text-sm", isSelected ? "text-zinc-300" : "text-zinc-700")}>
                  {r.supplier}
                </div>
                {/* Collections */}
                <div className={cn("w-36 shrink-0 text-sm", isSelected ? "text-zinc-300" : "text-zinc-700")}>
                  {r.collections}
                </div>
                {/* Customer */}
                <div className={cn("w-32 shrink-0 text-sm", isSelected ? "text-zinc-300" : "text-zinc-700")}>
                  {r.customer}
                </div>
                {/* Items (incoming qty, thousands-separated) */}
                <div className={cn("w-16 shrink-0 text-right text-sm font-medium", isSelected ? "text-white" : "text-zinc-900")}>
                  {r.incomingQty.toLocaleString("en-US")}
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
                      {stageLabels[stg] ?? stg}: {(qty ?? 0).toLocaleString("en-US")}
                    </span>
                  ))}
                </div>
                {/* Final ETA */}
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

              {/* Inline expansion (only rendered when selected). When the
                  row has child sub-rows (Master grouping → its sub-POs),
                  cascade into a nested PoExpandableList. Otherwise show the
                  SKU breakdown panel. */}
              {isSelected &&
                (subRowsByPoNumber?.[r.poNumber]?.length ? (
                  <div className="border-t border-zinc-100 bg-zinc-50/40 p-3">
                    <PoExpandableList
                      rows={subRowsByPoNumber[r.poNumber]}
                      skuRowsByPo={skuRowsByPo}
                      stageLabels={stageLabels}
                      // Forward subtitles so a master's child sub-POs surface
                      // the same "Sent ✓ / Not sent" indicator as the top-
                      // level Sub-PO view.
                      subtitles={subtitles}
                    />
                  </div>
                ) : (
                  <PoSkuBreakdown
                    poNumber={r.poNumber}
                    poId={r.poId}
                    // The row above already carries the Open-PO link.
                    hideOpenLinks
                    supplier={r.supplier}
                    rows={skuRowsByPo[r.poNumber] ?? []}
                    stageLabels={stageLabels}
                    onClose={() => setSelected(null)}
                  />
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
