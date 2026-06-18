"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const VIEWS = [
  { key: "inventory", label: "Incoming Inventory" },
  { key: "board", label: "Production Board" },
  { key: "timeline", label: "Production Timeline" },
] as const;

/**
 * View toggle for the Production page (Inventory / Board / Timeline). Sets the
 * `view` query param (omitted for the default inventory view so the bare URL
 * stays clean). Existing filter params are preserved.
 *
 * Visual: the admin's standard underline tab style (shared with the route-level
 * SectionTabs and the Radix ui/tabs / DetailTabs) — a brand underline under the
 * active view.
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
    <div className="inline-flex items-center gap-1 border-b border-zinc-200 text-sm">
      {VIEWS.map((v) => {
        const active = view === v.key;
        return (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            aria-pressed={active}
            className={cn(
              "relative -mb-px cursor-pointer rounded-sm px-3 py-2 font-medium transition-colors",
              "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5",
              active
                ? "text-zinc-900 after:bg-brand"
                : "text-zinc-500 hover:text-zinc-700 after:bg-transparent",
            )}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}
