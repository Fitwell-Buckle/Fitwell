"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const OPTIONS = [
  { value: "all", label: "All customers" },
  { value: "new", label: "New" },
  { value: "existing", label: "Existing" },
] as const;

/**
 * Scopes the dashboard to a customer cohort via the `customer` URL param
 * (omitted = All). "New" = first-ever order falls in the selected range;
 * "Existing" = ordered before it. Works like the segment toggle — filters out
 * whatever isn't selected across every tile + the Customer Value section.
 */
export function CustomerToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("customer") ?? "all";

  const setCustomer = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "all") params.delete("customer");
      else params.set("customer", value);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => setCustomer(o.value)}
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
