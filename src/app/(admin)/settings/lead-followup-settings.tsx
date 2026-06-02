"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Two lead follow-up rules, saved together:
//   1. Initial draft when a new lead is captured.
//   2. Follow-up on an email you sent that got no reply after N days.
// A general, AI-assisted multi-rule engine is planned separately — see
// specs/work-plans/todo/lead-followup-rule-engine.md.
export function LeadFollowupSettings({
  initial,
}: {
  initial: {
    initialDraftEnabled: boolean;
    enabled: boolean;
    nudgeAfterDays: number;
  };
}) {
  const router = useRouter();
  const [initialDraft, setInitialDraft] = useState(initial.initialDraftEnabled);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [days, setDays] = useState(String(initial.nudgeAfterDays));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    initialDraft !== initial.initialDraftEnabled ||
    enabled !== initial.enabled ||
    days !== String(initial.nudgeAfterDays);

  async function save() {
    setError(null);
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      setError("Enter a whole number of days between 1 and 365.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/settings/lead-followups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initialDraftEnabled: initialDraft,
          enabled,
          nudgeAfterDays: n,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Couldn't save.");
      } else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Rule 1: initial draft on new-lead capture */}
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <input
            type="checkbox"
            checked={initialDraft}
            onChange={(e) => {
              setInitialDraft(e.target.checked);
              setSaved(false);
            }}
            className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
          />
          Draft an initial email for a new lead
        </label>
        <p className="ml-6 text-xs text-zinc-500">
          When a new lead is captured, automatically draft an initial follow-up
          email into Next Steps.
        </p>
      </div>

      {/* Rule 2: follow-up on an unanswered sent email */}
      <div className="space-y-2 border-t border-zinc-100 pt-4">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setSaved(false);
            }}
            className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
          />
          Follow up on unanswered emails
        </label>
        <div className="ml-6 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
          <span>If an email you sent gets no reply within</span>
          <Input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              setSaved(false);
            }}
            disabled={!enabled}
            className="w-20"
          />
          <span>days, draft a threaded follow-up into Next Steps.</span>
        </div>
        <p className="ml-6 text-xs text-zinc-500">
          Covers emails to leads, customers, and suppliers — the reply lands in
          the original thread.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-end gap-3">
        {saved && !dirty && (
          <span className="text-sm font-medium text-emerald-600">✓ Saved</span>
        )}
        <Button size="sm" onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
