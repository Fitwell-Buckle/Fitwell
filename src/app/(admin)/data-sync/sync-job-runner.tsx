"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

function summarizeResult(data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(data)) {
    if (key === "status" || key === "timestamp" || key === "since") continue;
    if (typeof val === "object" && val !== null && "synced" in val) {
      const s = val as { synced: number; errors?: number };
      parts.push(`${s.synced} ${key}${s.errors ? ` (${s.errors} errors)` : ""}`);
    } else if (key === "rows" && typeof val === "number") {
      parts.push(`${val} rows`);
    } else if (key === "date" && typeof val === "string") {
      parts.push(val);
    }
  }
  return parts.length > 0 ? parts.join(", ") : "Done";
}

export function SyncJobRunner({
  path,
  disabled,
}: {
  path: string;
  disabled: boolean;
}) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setState("running");
    setResult(null);
    try {
      const res = await fetch(path, {
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
