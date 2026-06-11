"use client";

import { useEffect, useRef } from "react";
import { DataTable, Mono } from "@/components/ui/data-table";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { fmtDate } from "@/lib/production/display";
import type { IncomingRow } from "@/lib/production/inventory";

interface Props {
  poNumber: string;
  poId: string;
  supplier: string;
  rows: IncomingRow[];
  stageLabels: Record<string, string>;
  /** Suppress the banner "Open PO" link — the by-PO list puts Open-PO links
   *  on each row instead, so the breakdown shouldn't repeat them. The board /
   *  timeline views (no per-row link) leave this off and keep the link. */
  hideOpenLinks?: boolean;
  /** Called when the user dismisses the breakdown (clicks "← Back"). */
  onClose: () => void;
}

/**
 * Inline SKU breakdown that expands below a clicked PO row/card/track.
 * Animates in with a directional slide-up + blur reveal — no page navigation.
 */
export function PoSkuBreakdown({
  poNumber,
  poId,
  supplier,
  rows,
  stageLabels,
  hideOpenLinks,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Start blurry + shifted down, animate to crisp + natural position.
    el.style.opacity = "0";
    el.style.transform = "translateY(20px) scale(0.98)";
    el.style.filter = "blur(6px)";
    el.style.willChange = "opacity, transform, filter";
    // Small delay so the row-collapse animation has a head start.
    const t = setTimeout(() => {
      el.style.transition =
        "opacity 420ms cubic-bezier(0.16,1,0.3,1), transform 420ms cubic-bezier(0.16,1,0.3,1), filter 420ms ease";
      requestAnimationFrame(() => {
        el.style.opacity = "1";
        el.style.transform = "translateY(0) scale(1)";
        el.style.filter = "blur(0)";
      });
    }, 120);
    return () => clearTimeout(t);
  }, []);

  const total = rows.reduce((s, r) => s + r.incomingQty, 0);

  return (
    <div ref={ref} className="mt-0 opacity-0">
      {/* Header banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm font-semibold text-zinc-900">
            {poNumber}
          </span>
          <span className="text-sm text-zinc-500">{supplier}</span>
          {!hideOpenLinks && (
            <a
              href={`/modules/production/po/${poId}`}
              className="text-xs text-zinc-400 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-600"
              onClick={(e) => e.stopPropagation()}
            >
              Open PO →
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-zinc-400 hover:text-zinc-700"
        >
          ← Back
        </button>
      </div>

      {/* SKU table */}
      <DataTable className="rounded-t-none border-t-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Incoming</TableHead>
              <TableHead>By stage</TableHead>
              <TableHead>Nearest ETA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-zinc-400">
                  No units are in production at these stages yet — open the PO
                  to see all its line items.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.sku}>
                  <TableCell className="whitespace-nowrap">
                    <Mono>{r.sku}</Mono>
                  </TableCell>
                  <TableCell className="text-zinc-700">{r.title}</TableCell>
                  <TableCell className="text-right font-medium text-zinc-900">
                    {r.incomingQty}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(r.byStage).map(([stg, qty]) => (
                        <span
                          key={stg}
                          className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600"
                        >
                          {stageLabels[stg] ?? stg}: {qty}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {fmtDate(r.nearestEta)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DataTable>
      {total > 0 && (
        <p className="mt-2 border border-t-0 border-zinc-200 px-4 py-2 text-right text-sm text-zinc-500">
          Total incoming units:{" "}
          <span className="font-medium text-zinc-900">{total}</span>
        </p>
      )}
    </div>
  );
}
