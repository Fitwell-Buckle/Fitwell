"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// The one editable field on a sub-PO: what this supplier charges for their work.
export function SubPoPrice({
  poId,
  initialCents,
}: {
  poId: string;
  initialCents: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(
    initialCents != null ? (initialCents / 100).toString() : "",
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaved(false);
    const trimmed = value.trim();
    const price = trimmed === "" ? null : Number(trimmed);
    if (price != null && (!Number.isFinite(price) || price < 0)) {
      return setError("Enter a non-negative amount.");
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/production/po/${poId}/price`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Couldn't save the price.");
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
    <div className="mt-4 flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-500">
          Supplier price (what you pay this supplier)
        </label>
        <div className="flex items-center gap-1">
          <span className="text-sm text-zinc-400">$</span>
          <Input
            type="number"
            min="0"
            step="0.01"
            className="w-32"
            placeholder="0.00"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
          />
        </div>
      </div>
      <Button size="sm" variant="outline" disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save price"}
      </Button>
      {saved && <span className="text-xs text-emerald-600">Saved</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
