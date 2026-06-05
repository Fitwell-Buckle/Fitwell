"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Shows whether a PO has been sent to its supplier and lets an admin toggle it.
 * Emailing the PO auto-stamps "sent (email)"; this button is for POs handed off
 * via WhatsApp / phone / in person ("sent (manual)").
 */
export function PoSentControl({
  poId,
  sentAtIso,
  sentVia,
}: {
  poId: string;
  sentAtIso: string | null;
  sentVia: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(sent: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/production/po/${poId}/mark-sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sent }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Couldn't update.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const sentLabel = sentAtIso
    ? new Date(sentAtIso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="mt-1">
      {sentLabel ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Sent ✓
          </span>
          <span className="text-xs text-zinc-500">
            {sentLabel}
            {sentVia === "manual"
              ? " · manual"
              : sentVia === "email"
                ? " · email"
                : ""}
          </span>
          <button
            type="button"
            onClick={() => toggle(false)}
            disabled={busy}
            className="text-xs text-zinc-400 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-600 disabled:opacity-50"
          >
            {busy ? "…" : "Unmark"}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-zinc-400">Not sent</span>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => toggle(true)}
          >
            {busy ? "…" : "Mark as sent"}
          </Button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
