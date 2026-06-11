"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Positive-control stage check-ins. When on, suppliers are prompted (platform +
 * email) at each % of a stage's estimated duration to confirm they're on track;
 * silence or a flagged delay escalates to admins.
 */
export function StageCheckinSettings({
  initial,
}: {
  initial: { stageCheckinEnabled: boolean; stageCheckinThresholds: number[] };
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.stageCheckinEnabled);
  const [text, setText] = useState(initial.stageCheckinThresholds.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    enabled !== initial.stageCheckinEnabled ||
    text !== initial.stageCheckinThresholds.join(", ");

  function parseThresholds(): number[] | null {
    const parts = text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number);
    if (parts.length < 1 || parts.length > 3) return null;
    if (parts.some((n) => !Number.isInteger(n) || n < 1 || n > 99)) return null;
    return [...parts].sort((a, b) => a - b);
  }

  async function save() {
    setError(null);
    const thresholds = parseThresholds();
    if (!thresholds) {
      setError("Enter 1–3 ascending percentages between 1 and 99 (e.g. 50, 75, 95).");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/settings/production", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stageCheckinEnabled: enabled,
          stageCheckinThresholds: thresholds,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Couldn't save.");
      } else {
        setText(thresholds.join(", "));
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
        Prompt suppliers to confirm they&apos;re on track
      </label>
      <div className="ml-6 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
        <span>Check in at these % of each stage&apos;s estimated time:</span>
        <Input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          disabled={!enabled}
          className="w-32"
          placeholder="50, 75, 95"
        />
      </div>
      <p className="ml-6 text-xs text-zinc-500">
        e.g. <span className="font-medium">50, 75, 95</span> = halfway, 25%-to-go,
        5%-to-go. A flagged delay — or an overrun with no confirmation —
        escalates to admins.
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
