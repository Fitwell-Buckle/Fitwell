"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const GROUPS = [
  { key: "master", label: "Master" },
  { key: "po", label: "Sub-PO" },
  { key: "sku", label: "SKU" },
] as const;

/**
 * Grouping switch for the Production page — controls the data dimension
 * (Master PO / Sub-PO / SKU). Sets the `group` query param (omitted for the
 * default `po` so the bare URL stays clean) and preserves the active view +
 * filters.
 *
 * Visual: compact segmented button group with a navy active state. Distinct
 * from the lifted-pill view tabs (which use white active state on no
 * container) so the eye reads them as two different kinds of control —
 * "data slicing" vs "visualisation mode".
 */
export function ProductionGroupToggle({ group }: { group: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setGroup(g: string) {
    const params = new URLSearchParams(searchParams.toString());
    // "po" is the default → omit it to keep the URL clean; set group=sku|master only.
    if (g === "po") params.delete("group");
    else params.set("group", g);
    // Leaving a drill-down (selecting a grouping) clears the per-PO scope.
    params.delete("po");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="inline-flex rounded-md bg-zinc-100 p-0.5 text-xs font-medium">
      {GROUPS.map((g) => (
        <button
          key={g.key}
          type="button"
          onClick={() => setGroup(g.key)}
          aria-pressed={group === g.key}
          className={cn(
            "rounded px-2.5 py-1 transition-colors",
            group === g.key
              ? "bg-brand text-white shadow-sm"
              : "text-zinc-600 hover:bg-white hover:text-zinc-900",
          )}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}
