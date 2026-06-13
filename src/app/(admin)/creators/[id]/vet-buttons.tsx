"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Accept / reject a creator from the detail page (the list has the inline
 * row version). Approving moves the creator into the Approved bucket and
 * out of the to-vet queue; rejecting dumps it. Reset returns it to unvetted.
 */
export function VetButtons({
  creatorId,
  vettingStatus,
}: {
  creatorId: string;
  vettingStatus: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function set(next: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/creators/${creatorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vettingStatus: next }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Update failed");
      }
      toast.success(
        next === "approved"
          ? "Approved"
          : next === "rejected"
            ? "Rejected"
            : "Reset to unvetted",
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  const btn = "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40";

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={busy || vettingStatus === "approved"}
        onClick={() => set("approved")}
        className={cn(
          btn,
          vettingStatus === "approved"
            ? "bg-emerald-600 text-white"
            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
        )}
      >
        ✓ Approve
      </button>
      <button
        disabled={busy || vettingStatus === "rejected"}
        onClick={() => set("rejected")}
        className={cn(
          btn,
          vettingStatus === "rejected"
            ? "bg-red-600 text-white"
            : "bg-red-50 text-red-700 hover:bg-red-100",
        )}
      >
        ✗ Reject
      </button>
      {vettingStatus !== "unreviewed" && (
        <button
          disabled={busy}
          onClick={() => set("unreviewed")}
          className={cn(btn, "bg-zinc-100 text-zinc-500 hover:bg-zinc-200")}
        >
          ↺ Reset
        </button>
      )}
    </div>
  );
}
