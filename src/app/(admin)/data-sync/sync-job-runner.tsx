"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const DATE_RANGES = [
  { label: "Yesterday", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 180 days", days: 180 },
  { label: "Last 365 days", days: 365 },
];

function summarizeResult(data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(data)) {
    if (key === "status" || key === "timestamp" || key === "since") continue;
    if (typeof val === "object" && val !== null && "synced" in val) {
      const s = val as { synced: number; errors?: number };
      parts.push(`${s.synced} ${key}${s.errors ? ` (${s.errors} errors)` : ""}`);
    } else if (key === "rows" && typeof val === "number") {
      parts.push(`${val} rows`);
    } else if (key === "days" && typeof val === "number") {
      parts.push(`${val}d`);
    } else if (key === "date" && typeof val === "string") {
      parts.push(val);
    }
  }
  return parts.length > 0 ? parts.join(", ") : "Done";
}

export function SyncJobRunner({
  path,
  disabled,
  supportsDateRange,
}: {
  path: string;
  disabled: boolean;
  supportsDateRange?: boolean;
}) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );
  const [result, setResult] = useState<string | null>(null);
  const [days, setDays] = useState(1);

  async function run() {
    setState("running");
    setResult(null);
    try {
      const url =
        supportsDateRange && days > 1 ? `${path}?days=${days}` : path;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${getCronSecret()}` },
      });
      const data = await res.json();
      if (res.ok) {
        setState("done");
        setResult(summarizeResult(data));
        setTimeout(() => setState("idle"), 8000);
      } else {
        setState("error");
        setResult(data.error || data.message || res.statusText);
        setTimeout(() => setState("idle"), 8000);
      }
    } catch (err) {
      setState("error");
      setResult(err instanceof Error ? err.message : "Unknown error");
      setTimeout(() => setState("idle"), 8000);
    }
  }

  return (
    <div className="ml-4 flex shrink-0 items-center gap-3">
      {result && (
        <span
          className={`max-w-[250px] truncate text-xs ${
            state === "error" ? "text-red-500" : "text-emerald-600"
          }`}
          title={result}
        >
          {state === "done" ? `✓ ${result}` : result}
        </span>
      )}
      {supportsDateRange && (
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          disabled={disabled || state === "running"}
          className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-700 disabled:opacity-50"
        >
          {DATE_RANGES.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || state === "running"}
        onClick={run}
      >
        {state === "running" ? "Running..." : "Run"}
      </Button>
    </div>
  );
}

function getCronSecret(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_CRON_SECRET ?? "local-dev";
  }
  return "local-dev";
}
