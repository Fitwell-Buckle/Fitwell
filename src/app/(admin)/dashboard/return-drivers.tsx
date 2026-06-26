"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import {
  type ReturnDrivers,
  type ReturnRow,
  riskTone,
  TONE_TEXT,
  TONE_BAR,
  formatPct,
} from "@/lib/dashboard/return-drivers-format";
import { type RdDim, rdParam, parseRd } from "@/lib/dashboard/return-drivers-labels";

/** One metric block: a labelled list of clickable segments with a bar each. */
function MetricBlock({
  title,
  dim,
  rows,
  baseline,
  activeRd,
  onToggle,
}: {
  title: string;
  dim: RdDim;
  rows: ReturnRow[];
  baseline: number;
  activeRd: string | null;
  onToggle: (dim: RdDim, value: string) => void;
}) {
  const maxPct = Math.max(0.0001, ...rows.map((r) => r.pct));
  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h4>
      <div className="space-y-2">
        {rows.map((r) => {
          const tone = riskTone(r.pct, baseline, r.unitsSold);
          const isActive = activeRd === rdParam(dim, r.segment);
          return (
            <button
              key={r.segment}
              type="button"
              onClick={() => onToggle(dim, r.segment)}
              title={
                isActive
                  ? "Click to clear this filter"
                  : `Filter the whole dashboard to ${r.segment}`
              }
              className={`block w-full rounded px-1.5 py-1 text-left transition-colors ${
                isActive ? "bg-zinc-100 ring-1 ring-zinc-300" : "hover:bg-zinc-50"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-zinc-700">{r.segment}</span>
                <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                  <span className={`font-medium ${TONE_TEXT[tone]}`}>
                    {formatPct(r.pct)}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    {r.unitsReturned}/{r.unitsSold}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={`h-full rounded-full ${TONE_BAR[tone]}`}
                  style={{ width: `${(r.pct / maxPct) * 100}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Time-to-refund block: clickable bands, each a share of all units sold. */
function LatencyBlock({
  rows,
  baseline,
  activeRd,
  onToggle,
}: {
  rows: ReturnDrivers["latency"];
  baseline: number;
  activeRd: string | null;
  onToggle: (dim: RdDim, value: string) => void;
}) {
  const maxPct = Math.max(0.0001, ...rows.map((r) => r.pctOfAll));
  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Time to Refund
      </h4>
      <div className="space-y-2">
        {rows.map((r) => {
          const isActive = activeRd === rdParam("latency", r.band);
          return (
            <button
              key={r.band}
              type="button"
              onClick={() => onToggle("latency", r.band)}
              title={
                isActive
                  ? "Click to clear this filter"
                  : `Filter the whole dashboard to returns at ${r.band}`
              }
              className={`block w-full rounded px-1.5 py-1 text-left transition-colors ${
                isActive ? "bg-zinc-100 ring-1 ring-zinc-300" : "hover:bg-zinc-50"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-zinc-700">{r.band}</span>
                <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                  <span className="font-medium text-zinc-700">
                    {formatPct(r.pctOfAll)}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    {r.unitsReturned} units
                  </span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-zinc-400"
                  style={{ width: `${(r.pctOfAll / maxPct) * 100}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] leading-snug text-zinc-400">
        Each band as a share of all units sold — bands sum to the{" "}
        {formatPct(baseline)} overall rate.
      </p>
    </div>
  );
}

/**
 * Return Drivers — small-multiples of the unit-level return rate across nine
 * dimensions. Clicking any segment scopes the whole dashboard to that cohort
 * via the `rd` URL param (click the active segment again to clear), like the
 * Returns Breakdown rows. The card itself stays all-time (it's the selector).
 */
export function ReturnDriversCard({
  data,
  activeRd,
}: {
  data: ReturnDrivers;
  activeRd: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const b = data.baseline.pct;

  const onToggle = useCallback(
    (dim: RdDim, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const next = rdParam(dim, value);
      if (params.get("rd") === next) params.delete("rd");
      else params.set("rd", next);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const clear = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("rd");
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  const active = parseRd(activeRd);

  return (
    <>
      {active && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="text-zinc-500">Dashboard filtered to</span>
          <span className="rounded bg-zinc-900 px-2 py-0.5 font-medium text-white">
            {active.value}
          </span>
          <button
            type="button"
            onClick={clear}
            className="text-xs font-medium text-zinc-500 underline hover:text-zinc-900"
          >
            clear
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricBlock title="Product Family" dim="family" rows={data.family} baseline={b} activeRd={activeRd} onToggle={onToggle} />
        <MetricBlock title="Product Size" dim="size" rows={data.size} baseline={b} activeRd={activeRd} onToggle={onToggle} />
        <MetricBlock title="Product Color" dim="color" rows={data.color} baseline={b} activeRd={activeRd} onToggle={onToggle} />
        <MetricBlock title="Products in Order" dim="basket" rows={data.basket} baseline={b} activeRd={activeRd} onToggle={onToggle} />
        <LatencyBlock rows={data.latency} baseline={b} activeRd={activeRd} onToggle={onToggle} />
        <MetricBlock title="Signal / Came From" dim="source" rows={data.source} baseline={b} activeRd={activeRd} onToggle={onToggle} />
        <MetricBlock title="Time of Day" dim="tod" rows={data.timeOfDay} baseline={b} activeRd={activeRd} onToggle={onToggle} />
        <MetricBlock title="Day of Week" dim="dow" rows={data.dayOfWeek} baseline={b} activeRd={activeRd} onToggle={onToggle} />
        <MetricBlock title="Order Country" dim="country" rows={data.country} baseline={b} activeRd={activeRd} onToggle={onToggle} />
      </div>
    </>
  );
}
