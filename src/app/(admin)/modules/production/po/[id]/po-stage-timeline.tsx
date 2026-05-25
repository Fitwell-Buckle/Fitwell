"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { STAGE_LABELS, type ProductionStage } from "@/lib/production/stages";
import { fmtDate } from "@/lib/production/display";

export interface TimelineEvent {
  id: string;
  stage: ProductionStage;
  date: string; // YYYY-MM-DD (entered_at)
}

export interface TimelineLine {
  id: string;
  sku: string;
  title: string;
  events: TimelineEvent[];
}

export function PoStageTimeline({ lines }: { lines: TimelineLine[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Local edits keyed by event id; only changed entries are persisted.
  const [draft, setDraft] = useState<Record<string, string>>({});

  function cancel() {
    setEditing(false);
    setDraft({});
    setError(null);
  }

  async function save() {
    setError(null);
    const changed = Object.entries(draft).filter(([id, date]) => {
      const original = lines.flatMap((l) => l.events).find((e) => e.id === id);
      return original && date && date !== original.date;
    });
    if (changed.length === 0) {
      cancel();
      return;
    }

    setBusy(true);
    try {
      for (const [id, enteredDate] of changed) {
        const res = await fetch(`/api/production/stage-events/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enteredDate }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.error || "Couldn't save a date.");
          setBusy(false);
          return;
        }
      }
      setEditing(false);
      setDraft({});
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Stage timeline</h2>
        {editing ? (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={cancel} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save dates"}
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit dates
          </Button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 space-y-4">
        {lines.map((li) => (
          <div key={li.id}>
            <div className="text-xs font-medium text-zinc-500">
              {li.sku} — {li.title}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {li.events.map((ev) => (
                <span key={ev.id} className="flex items-center gap-1 text-xs text-zinc-500">
                  {STAGE_LABELS[ev.stage]}
                  {editing ? (
                    <input
                      type="date"
                      value={draft[ev.id] ?? ev.date}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, [ev.id]: e.target.value }))
                      }
                      className="rounded border border-zinc-200 px-1.5 py-0.5 text-xs text-zinc-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300"
                    />
                  ) : (
                    <span className="text-zinc-400">{fmtDate(ev.date)}</span>
                  )}
                  <span className="text-zinc-300">›</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
