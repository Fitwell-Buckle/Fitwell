"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const VIEWS = [
  { key: "inventory", label: "Incoming Inventory" },
  { key: "board", label: "Production Board" },
  { key: "timeline", label: "Production Timeline" },
] as const;

/**
 * Segmented control for the Production Summary page. Switches between the
 * Incoming Inventory (default), Production Board, and Production Timeline views
 * by setting the `view` query param (omitted for the default inventory view so
 * the bare URL stays clean). Existing filter params are preserved.
 */
export function ProductionViewToggle({ view }: { view: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setView(v: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (v === "inventory") params.delete("view");
    else params.set("view", v);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 text-sm">
      {VIEWS.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => setView(v.key)}
          aria-pressed={view === v.key}
          className={cn(
            "rounded-md px-3 py-1.5 font-medium transition-colors",
            view === v.key
              ? "bg-zinc-900 text-white"
              : "text-zinc-500 hover:text-zinc-900",
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
