"use client";

import { useRouter } from "next/navigation";
import {
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Mono } from "@/components/ui/data-table";
import { fmtDate } from "@/lib/production/display";
import { ChevronRight } from "lucide-react";
import type { IncomingPoRow } from "@/lib/production/inventory";

/**
 * Client-rendered table body for the "by PO" Incoming Inventory view. Renders
 * as a client component so the whole row is clickable (onClick on <tr> requires
 * a client boundary; wrapping <tr> in <a> is invalid HTML).
 */
export function PoInventoryTableBody({
  rows,
  stageLabels,
  poDrillHrefBase,
}: {
  rows: IncomingPoRow[];
  stageLabels: Record<string, string>;
  poDrillHrefBase: string;
}) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <TableBody>
        <TableRow>
          <TableCell colSpan={5} className="py-8 text-center text-zinc-400">
            Nothing in production matches.
          </TableCell>
        </TableRow>
      </TableBody>
    );
  }

  return (
    <TableBody>
      {rows.map((r) => {
        const href = `${poDrillHrefBase}${encodeURIComponent(r.poNumber)}`;
        return (
          <TableRow
            key={r.poNumber}
            onClick={() => router.push(href)}
            className="group cursor-pointer hover:bg-zinc-50/80 active:bg-zinc-100/80 transition-colors"
            title="Expand to see this PO's SKUs"
          >
            <TableCell className="whitespace-nowrap">
              <Mono>{r.poNumber}</Mono>
            </TableCell>
            <TableCell className="text-zinc-700">{r.supplier}</TableCell>
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
            <TableCell className="text-zinc-500">{fmtDate(r.nearestEta)}</TableCell>
          <TableCell className="w-6 pr-3 text-right">
            <ChevronRight className="ml-auto h-3.5 w-3.5 text-zinc-200 transition-colors group-hover:text-zinc-400" />
          </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  );
}
