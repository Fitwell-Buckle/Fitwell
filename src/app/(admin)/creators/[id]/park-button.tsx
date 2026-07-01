"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * "Pass for now" toggle on the creator detail page. Parking keeps the creator
 * approved but drops them out of your working views until you un-park — the
 * bench for approved creators you're not contacting this outreach pass.
 * Only rendered for approved creators (parking an unvetted one is meaningless).
 */
export function ParkButton({
  creatorId,
  parked,
}: {
  creatorId: string;
  parked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/creators/${creatorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parked: !parked }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Update failed");
      }
      toast.success(
        parked
          ? "Un-parked — back in your active queue"
          : "Parked — pass for now (still approved)",
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40";
  return (
    <button
      disabled={busy}
      onClick={toggle}
      title={
        parked
          ? "Return this creator to your active working queue"
          : "Pass for now — stays approved, drops out of your working views"
      }
      className={cn(
        btn,
        parked
          ? "bg-amber-500 text-white hover:bg-amber-600"
          : "bg-amber-50 text-amber-700 hover:bg-amber-100",
      )}
    >
      {parked ? "▶ Un-park" : "⏸ Park"}
    </button>
  );
}
