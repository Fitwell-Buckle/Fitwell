"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Inline vetting controls for a list row: approve / reject / boost.
 * Click-throughs are stopped so the row's navigation doesn't fire.
 * Designed for speed — vetting 735 creators is a volume job.
 */
export function VetActions({
  creatorId,
  vettingStatus,
  scoreBoost,
  parked,
}: {
  creatorId: string;
  vettingStatus: string;
  scoreBoost: number;
  parked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/creators/${creatorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Update failed");
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "rounded px-1.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-30";

  return (
    <div
      className="flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        title="Approve"
        disabled={busy || vettingStatus === "approved"}
        onClick={() => patch({ vettingStatus: "approved" })}
        className={cn(
          btn,
          vettingStatus === "approved"
            ? "bg-emerald-600 text-white"
            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
        )}
      >
        ✓
      </button>
      <button
        title="Reject (hides from list; restore anytime via the Rejected pill)"
        disabled={busy || vettingStatus === "rejected"}
        onClick={() => patch({ vettingStatus: "rejected" })}
        className={cn(
          btn,
          vettingStatus === "rejected"
            ? "bg-red-600 text-white"
            : "bg-red-50 text-red-700 hover:bg-red-100",
        )}
      >
        ✗
      </button>
      {vettingStatus !== "unreviewed" && (
        <button
          title="Reset to unreviewed (un-approve / restore)"
          disabled={busy}
          onClick={() => patch({ vettingStatus: "unreviewed" })}
          className={cn(btn, "bg-zinc-100 text-zinc-500 hover:bg-zinc-200")}
        >
          ↺
        </button>
      )}
      {vettingStatus === "approved" && (
        <button
          title={
            parked
              ? "Un-park — return to your active queue"
              : "Park — pass for now (stays approved, drops out of working views)"
          }
          disabled={busy}
          onClick={() => patch({ parked: !parked })}
          className={cn(
            btn,
            parked
              ? "bg-amber-500 text-white"
              : "bg-amber-50 text-amber-700 hover:bg-amber-100",
          )}
        >
          {parked ? "▶" : "⏸"}
        </button>
      )}
      <button
        title="Boost +10"
        disabled={busy}
        onClick={() => patch({ scoreBoost: scoreBoost + 10 })}
        className={cn(btn, "bg-zinc-100 text-zinc-700 hover:bg-zinc-200")}
      >
        ▲
      </button>
      <button
        title="Lower −10"
        disabled={busy}
        onClick={() => patch({ scoreBoost: scoreBoost - 10 })}
        className={cn(btn, "bg-zinc-100 text-zinc-700 hover:bg-zinc-200")}
      >
        ▼
      </button>
      {scoreBoost !== 0 && (
        <span
          className={cn(
            "font-mono text-[11px]",
            scoreBoost > 0 ? "text-emerald-600" : "text-red-500",
          )}
        >
          {scoreBoost > 0 ? `+${scoreBoost}` : scoreBoost}
        </span>
      )}
    </div>
  );
}
