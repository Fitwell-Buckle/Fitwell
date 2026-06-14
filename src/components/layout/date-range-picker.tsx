"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Granularity } from "@/lib/date-range";
import { storeToday, shiftDate } from "@/lib/timezone";

const PRESETS = [
  // days = -2 is a sentinel for "Today" (from = to = today).
  { label: "Today", days: -2 },
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

// "All" sets `from` to this fixed sentinel (well before the store existed)
// through today, so it reads the full history. Deleting from/to instead would
// fall through to parseDateRange's rolling 30-day default — i.e. "All" would
// silently become "30d".
const ALL_FROM = "2000-01-01";

// All preset math anchors to "today" in the *store* timezone (see
// src/lib/timezone.ts), not the viewer's UTC date. Otherwise an evening-Pacific
// click of "Today" resolves to the next UTC day and reads $0.
function getPresetRange(days: number): { from: string; to: string } {
  const to = storeToday();
  if (days === 0) return { from: ALL_FROM, to }; // All
  if (days === -2) return { from: to, to }; // Today
  if (days === -1) return { from: `${to.slice(0, 4)}-01-01`, to }; // YTD
  return { from: shiftDate(to, -days), to };
}

function getActiveDays(from: string | null, to: string | null): number | null {
  if (!from) return 30;
  const today = storeToday();
  // Every preset ends at "today". If the end date has been narrowed to anything
  // else, it's a custom range — don't highlight a preset (especially not "All",
  // which would otherwise stay lit while the cards silently exclude recent data).
  if (to && to !== today) return null;
  if (from === ALL_FROM) return 0; // All
  if (from === today && to === today) return -2; // Today
  if (from === `${today.slice(0, 4)}-01-01`) return -1; // YTD
  const diff = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      (1000 * 60 * 60 * 24),
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

// Pages whose path (or a subpath) shows the date-range picker.
const PICKER_PREFIXES = [
  "/dashboard",
  "/campaigns",
  "/attribution",
  "/funnel",
  "/orders",
  "/invoices",
  "/influencer-tracking",
  "/products",
];
// Pages that show the picker only on that exact path (not subpaths) — e.g. the
// POs & Production page itself, but not /po/new, /po/[id], or /suppliers.
const PICKER_EXACT = ["/modules/production"];
// Create/edit forms where a date filter is meaningless — hidden even though a
// prefix above would otherwise match (e.g. /invoices/new, /influencer-tracking/new).
const PICKER_EXCLUDE = ["/invoices/new", "/influencer-tracking/new"];

function showsPicker(pathname: string): boolean {
  if (PICKER_EXCLUDE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return false;
  }
  // The printable packaging label has no historical reporting — hide the
  // picker so it doesn't sit above the artwork.
  if (/^\/products\/[^/]+\/label$/.test(pathname)) return false;
  if (PICKER_EXACT.includes(pathname)) return true;
  return PICKER_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function DateRangePicker({ embedded }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const activeDays = getActiveDays(from, to);
  const activeGranularity = (searchParams.get("g") as Granularity | null) ?? null;

  // Compute the effective granularity for highlighting
  const effectiveGranularity: Granularity =
    activeGranularity ??
    (activeDays !== null ? defaultGranularity(Math.abs(activeDays)) : "day");

  const setRange = useCallback(
    (days: number) => {
      const params = new URLSearchParams(searchParams.toString());
      const range = getPresetRange(days);
      params.set("from", range.from);
      params.set("to", range.to);
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

  // Manual date-range inputs (kept in sync with the URL).
  const [mFrom, setMFrom] = useState(from ?? "");
  const [mTo, setMTo] = useState(to ?? "");
  useEffect(() => {
    setMFrom(from ?? "");
    setMTo(to ?? "");
  }, [from, to]);

  const applyManual = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (mFrom) params.set("from", mFrom);
    else params.delete("from");
    if (mTo) params.set("to", mTo);
    else params.delete("to");
    params.delete("page");
    params.delete("g");
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams, mFrom, mTo]);

  if (!showsPicker(pathname)) {
    return embedded ? null : (
      <div className="h-12 shrink-0 border-b border-zinc-200/80 bg-white" />
    );
  }

  const dateInputCls =
    "h-7 shrink-0 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300";
  const pillCls =
    "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors";
  const dividerCls = "mx-1.5 h-4 w-px shrink-0 bg-zinc-200";

  // On phones the full control set (5 presets + 3 granularities + 2 date
  // inputs + Apply) can't fit one 48px row, and wrapping gets clipped by the
  // fixed-height header. So on mobile it's a single horizontally-scrollable
  // row; from `sm` up it wraps and right-aligns as before.
  const content = (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:justify-end sm:overflow-visible [&::-webkit-scrollbar]:hidden">
      {PRESETS.map((preset) => (
        <button
          key={preset.label}
          onClick={() => setRange(preset.days)}
          className={`${pillCls} ${
            activeDays === preset.days
              ? "bg-brand text-white"
              : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          }`}
        >
          {preset.label}
        </button>
      ))}

      <span className={dividerCls} />

      {GRANULARITIES.map((g) => (
        <button
          key={g.value}
          onClick={() => setGranularity(g.value)}
          className={`${pillCls} ${
            effectiveGranularity === g.value
              ? "bg-brand text-white"
              : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          }`}
        >
          {g.label}
        </button>
      ))}

      <span className={dividerCls} />

      <input
        type="date"
        value={mFrom}
        onChange={(e) => setMFrom(e.target.value)}
        className={dateInputCls}
        aria-label="From date"
      />
      <span className="shrink-0 text-xs text-zinc-400">–</span>
      <input
        type="date"
        value={mTo}
        onChange={(e) => setMTo(e.target.value)}
        className={dateInputCls}
        aria-label="To date"
      />
      <button onClick={applyManual} className={`${pillCls} shrink-0 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700`}>
        Apply
      </button>
    </div>
  );

  if (embedded) return content;

  return (
    <div className="flex h-12 shrink-0 items-center justify-end border-b border-zinc-200/80 bg-white px-10">
      {content}
    </div>
  );
}
