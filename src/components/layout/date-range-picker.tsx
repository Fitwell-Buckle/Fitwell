"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { Granularity } from "@/lib/date-range";

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "YTD", days: -1 },
  { label: "All", days: 0 },
] as const;

const GRANULARITIES: { label: string; value: Granularity }[] = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
];

function formatDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function getPresetRange(days: number): { from: string; to: string } | null {
  const to = formatDate(new Date());
  if (days === 0) return null;
  if (days === -1) {
    const ytd = new Date();
    ytd.setMonth(0, 1);
    return { from: formatDate(ytd), to };
  }
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: formatDate(from), to };
}

function getActiveDays(from: string | null, to: string | null): number | null {
  if (!from) return 30;
  const now = new Date();
  const fromDate = new Date(from);
  const ytd = new Date();
  ytd.setMonth(0, 1);
  if (formatDate(fromDate) === formatDate(ytd)) return -1;
  const diff = Math.round(
    (now.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  for (const p of PRESETS) {
    if (p.days === diff) return diff;
  }
  return null;
}

function defaultGranularity(days: number): Granularity {
  if (days <= 30 && days > 0) return "day";
  if (days <= 90 && days > 0) return "week";
  return "month";
}

export function DateRangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const activeDays = getActiveDays(from, to);
  const activeGranularity = (searchParams.get("g") as Granularity | null) ?? null;

  // Compute the effective granularity for highlighting
  const effectiveGranularity: Granularity = activeGranularity
    ?? (activeDays !== null ? defaultGranularity(Math.abs(activeDays)) : "day");

  const setRange = useCallback(
    (days: number) => {
      const params = new URLSearchParams(searchParams.toString());
      const range = getPresetRange(days);
      if (range) {
        params.set("from", range.from);
        params.set("to", range.to);
      } else {
        params.delete("from");
        params.delete("to");
      }
      params.delete("page");
      // Reset granularity to default for the new range
      params.delete("g");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const setGranularity = useCallback(
    (g: Granularity) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("g", g);
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex items-center gap-1">
      {PRESETS.map((preset) => (
        <button
          key={preset.label}
          onClick={() => setRange(preset.days)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            activeDays === preset.days
              ? "bg-zinc-900 text-white"
              : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          }`}
        >
          {preset.label}
        </button>
      ))}

      <span className="mx-1.5 h-4 w-px bg-zinc-200" />

      {GRANULARITIES.map((g) => (
        <button
          key={g.value}
          onClick={() => setGranularity(g.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            effectiveGranularity === g.value
              ? "bg-zinc-900 text-white"
              : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          }`}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}
