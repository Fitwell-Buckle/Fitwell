"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

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
        setResult(JSON.stringify(data, null, 2));
        setTimeout(() => setState("idle"), 5000);
      } else {
        setState("error");
        setResult(data.error || data.message || res.statusText);
        setTimeout(() => setState("idle"), 5000);
      }
    } catch (err) {
      setState("error");
      setResult(err instanceof Error ? err.message : "Unknown error");
      setTimeout(() => setState("idle"), 5000);
    }
  }

  return (
    <div className="ml-4 flex shrink-0 items-center gap-3">
      {result && (
        <span
          className={`max-w-[200px] truncate text-xs ${
            state === "error" ? "text-red-500" : "text-emerald-600"
          }`}
          title={result}
        >
          {state === "done" ? "Success" : result}
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
