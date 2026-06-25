"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Mono } from "@/components/ui/data-table";
import { formatCurrency } from "@/lib/chart-utils";

export interface ReturnsBreakdownRow {
  key: "exchange" | "pure";
  label: string;
  hint: string;
  orders: number;
  value: number;
}

/**
 * Returns Breakdown table — proportion bar + a row per type. Clicking a row
 * scopes the whole dashboard to that return type via the `returns` URL param
 * (click the active row again to clear), like the segment/customer toggles.
 */
export function ReturnsBreakdown({
  rows,
  totalReturns,
  active,
}: {
  rows: ReturnsBreakdownRow[];
  totalReturns: number;
  active: "all" | "exchange" | "pure";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const toggle = useCallback(
    (key: "exchange" | "pure") => {
      const params = new URLSearchParams(searchParams.toString());
      if (active === key) params.delete("returns");
      else params.set("returns", key);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams, active],
  );

  const pctOfReturns = (value: number) =>
    totalReturns > 0 ? (value / totalReturns) * 100 : 0;

  return (
    <>
      {/* Proportion of refund value: exchange (zinc) vs pure (amber). */}
      <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-zinc-100">
        {rows.map((r) => (
          <div
            key={r.key}
            className={r.key === "exchange" ? "bg-zinc-800" : "bg-amber-500"}
            style={{ width: `${pctOfReturns(r.value)}%` }}
          />
        ))}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Orders</TableHead>
            <TableHead className="text-right">Refund value</TableHead>
            <TableHead className="text-right">% of returns</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow
              key={r.key}
              onClick={() => toggle(r.key)}
              className={`cursor-pointer transition-colors ${
                active === r.key ? "bg-zinc-100" : "hover:bg-zinc-50"
              }`}
              title={
                active === r.key
                  ? "Click to clear this filter"
                  : `Filter the dashboard to ${r.label.toLowerCase()} orders`
              }
            >
              <TableCell className="font-medium text-zinc-900">
                <span className="inline-flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      r.key === "exchange" ? "bg-zinc-800" : "bg-amber-500"
                    }`}
                  />
                  {r.label}{" "}
                  <span className="text-xs font-normal text-zinc-400">
                    ({r.hint})
                  </span>
                  {active === r.key && (
                    <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                      filtering · clear
                    </span>
                  )}
                </span>
              </TableCell>
              <TableCell className="text-right">
                {r.orders.toLocaleString()}
              </TableCell>
              <TableCell className="text-right">
                <Mono>{formatCurrency(r.value)}</Mono>
              </TableCell>
              <TableCell className="text-right text-zinc-500">
                {totalReturns > 0
                  ? `${Math.round(pctOfReturns(r.value))}%`
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
