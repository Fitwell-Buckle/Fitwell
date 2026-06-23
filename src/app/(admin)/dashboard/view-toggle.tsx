"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Table2, LineChart } from "lucide-react";

/**
 * Dashboard table/graph switch. Drives the `view` URL param (like the date
 * picker drives `from`/`to`/`g`), so the server-rendered tiles re-render as
 * numbers (table) or line charts (graph). Sits in the dashboard top bar.
 */
export function DashboardViewToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "graph" ? "graph" : "table";

  const setView = useCallback(
    (v: "table" | "graph") => {
      const params = new URLSearchParams(searchParams.toString());
      if (v === "graph") params.set("view", "graph");
      else params.delete("view");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const pill =
    "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors";
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-0.5">
      <button
        onClick={() => setView("table")}
        className={`${pill} ${
          view === "table"
            ? "bg-brand text-white"
            : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
        }`}
        aria-pressed={view === "table"}
      >
        <Table2 className="h-3.5 w-3.5" /> Table
      </button>
      <button
        onClick={() => setView("graph")}
        className={`${pill} ${
          view === "graph"
            ? "bg-brand text-white"
            : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
        }`}
        aria-pressed={view === "graph"}
      >
        <LineChart className="h-3.5 w-3.5" /> Graph
      </button>
    </div>
  );
}
