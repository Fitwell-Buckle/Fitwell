"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface CheckinPrompt {
  /** A representative pending check-in row id for this stage instance. */
  id: string;
  stageLabel: string;
  /** Human "~60% through its estimated time" line. */
  detail: string;
}

/**
 * Positive-control prompts shown on the supplier PO page. For each stage that's
 * partway through its estimated time, the supplier must affirmatively confirm
 * on-track or flag a delay. Resolving one POSTs to the check-in API (which
 * clears every pending threshold for that stage at once) and refreshes.
 */
export function StageCheckinPrompts({ prompts }: { prompts: CheckinPrompt[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flagging, setFlagging] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function respond(id: string, status: "on_track" | "at_risk") {
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/supplier/stage-checkin/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          note: status === "at_risk" ? note.trim() || undefined : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Couldn't save your response.");
      } else {
        setFlagging(null);
        setNote("");
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (prompts.length === 0) return null;

  return (
    <Card className="mt-6 border-amber-200 bg-amber-50/60 p-5">
      <h2 className="text-sm font-semibold text-amber-900">
        Are you on track?
      </h2>
      <p className="mt-1 text-xs text-amber-700">
        Please confirm each stage below is on track, or flag a delay so we can
        plan around it.
      </p>
      <div className="mt-3 space-y-3">
        {prompts.map((p) => (
          <div
            key={p.id}
            className="rounded-md border border-amber-200 bg-white px-3 py-2.5"
          >
            <div className="text-sm font-medium text-zinc-900">
              {p.stageLabel}
            </div>
            <div className="text-xs text-zinc-500">{p.detail}</div>
            {flagging === p.id ? (
              <div className="mt-2 space-y-2">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="What's the delay? (optional)"
                  className="flex w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setFlagging(null);
                      setNote("");
                    }}
                    disabled={busyId === p.id}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => respond(p.id, "at_risk")}
                    disabled={busyId === p.id}
                  >
                    {busyId === p.id ? "Submitting…" : "Submit delay"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => respond(p.id, "on_track")}
                  disabled={busyId === p.id}
                >
                  {busyId === p.id ? "Saving…" : "✓ On track"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFlagging(p.id);
                    setError(null);
                  }}
                  disabled={busyId === p.id}
                >
                  Flag a delay
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
