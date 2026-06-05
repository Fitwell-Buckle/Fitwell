"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const GROUPS = [
  { key: "sku", label: "By SKU" },
  { key: "po", label: "By PO" },
] as const;

/**
 * "By SKU / By PO" grouping toggle for the Production Summary. Sets the `group`
 * query param (omitted for the default `sku` so the bare URL stays clean) and
 * preserves the active view + filters.
 */
export function ProductionGroupToggle({ group }: { group: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setGroup(g: string) {
    const params = new URLSearchParams(searchParams.toString());
    // "po" is the default → omit it to keep the URL clean; set group=sku only.
    if (g === "po") params.delete("group");
    else params.set("group", g);
    // Leaving a drill-down (selecting a grouping) clears the per-PO scope.
    params.delete("po");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 text-sm">
      {GROUPS.map((g) => (
        <button
          key={g.key}
          type="button"
          onClick={() => setGroup(g.key)}
          aria-pressed={group === g.key}
          className={cn(
            "rounded-md px-3 py-1.5 font-medium transition-colors",
            group === g.key
              ? "bg-zinc-900 text-white"
              : "text-zinc-500 hover:text-zinc-900",
          )}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}
