"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Supplier ETA-reminder cadence. When on, a daily cron emails suppliers who
 * still have line items without a Final ETA, no more often than every N days,
 * until they're filled in.
 */
export function EtaReminderSettings({
  initial,
}: {
  initial: { etaReminderEnabled: boolean; etaReminderIntervalDays: number };
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.etaReminderEnabled);
  const [days, setDays] = useState(String(initial.etaReminderIntervalDays));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    enabled !== initial.etaReminderEnabled ||
    days !== String(initial.etaReminderIntervalDays);

  async function save() {
    setError(null);
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 90) {
      setError("Enter a whole number of days between 1 and 90.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/settings/production", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          etaReminderEnabled: enabled,
          etaReminderIntervalDays: n,
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
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            setSaved(false);
          }}
          className="h-4 w-4 rounded border-zinc-300 accent-brand"
        />
        Remind suppliers to set delivery ETAs
      </label>
      <div className="ml-6 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
        <span>Email suppliers with un-set line-item ETAs every</span>
        <Input
          type="number"
          min={1}
          max={90}
          value={days}
          onChange={(e) => {
            setDays(e.target.value);
            setSaved(false);
          }}
          disabled={!enabled}
          className="w-20"
        />
        <span>day(s) until they&apos;re filled in.</span>
      </div>
      <p className="ml-6 text-xs text-zinc-500">
        Sent to the supplier&apos;s contact + portal-login emails. A supplier
        stops getting reminders once every line they own has a Final ETA.
      </p>

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
