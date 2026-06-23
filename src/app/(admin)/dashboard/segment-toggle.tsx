"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const OPTIONS = [
  { value: "all", label: "All" },
  { value: "d2c", label: "D2C" },
  { value: "tradeshow", label: "Trade Show" },
  { value: "b2b", label: "B2B Wholesale" },
] as const;

/**
 * Scopes the whole dashboard to a sales segment via the `segment` URL param
 * (omitted = All). Replaces the old "Sales by Segment" breakdown card — pick a
 * segment and every tile + the Customer Value section reflects just that one.
 */
export function SegmentToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("segment") ?? "all";

  const setSegment = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "all") params.delete("segment");
      else params.set("segment", value);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => setSegment(o.value)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            current === o.value
              ? "bg-brand text-white"
              : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
          }`}
          aria-pressed={current === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
