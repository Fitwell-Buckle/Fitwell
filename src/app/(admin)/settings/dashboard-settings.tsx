"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Assumed per-return shipping-label cost (what the business pays for the
 * prepaid return label). Entered in dollars, stored in cents. Folded into the
 * dashboard's Avg Return Value tile. It's an estimate because Shopify's Admin
 * API doesn't expose the real merchant-paid label cost.
 */
export function DashboardSettings({
  initial,
}: {
  initial: { returnLabelCostCents: number };
}) {
  const router = useRouter();
  const [dollars, setDollars] = useState(
    (initial.returnLabelCostCents / 100).toFixed(2),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = dollars !== (initial.returnLabelCostCents / 100).toFixed(2);

  async function save() {
    setError(null);
    const value = Number(dollars);
    if (!Number.isFinite(value) || value < 0 || value > 1000) {
      setError("Enter a dollar amount between 0 and 1000.");
      return;
    }
    const cents = Math.round(value * 100);
    setBusy(true);
    try {
      const res = await fetch("/api/settings/dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnLabelCostCents: cents }),
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
      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
        <span>Assume each return costs</span>
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500">
            $
          </span>
          <Input
            type="number"
            min={0}
            max={1000}
            step={0.01}
            value={dollars}
            onChange={(e) => {
              setDollars(e.target.value);
              setSaved(false);
            }}
            className="w-28 pl-5"
          />
        </div>
        <span>for the return shipping label.</span>
      </div>
      <p className="text-xs text-zinc-500">
        Added to the average refund on the dashboard&apos;s Avg Return Value
        tile. An estimate — Shopify doesn&apos;t expose the real label cost via
        its API, so set this to your typical return-label price.
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
