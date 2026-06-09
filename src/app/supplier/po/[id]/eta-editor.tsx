"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Inline date editor for a PO's expected delivery date. Lets the supplier
 * keep their own ETA up to date; submits to /api/supplier/po/[id]/eta which
 * scopes the write to the primary supplier of the PO.
 */
export function EtaEditor({
  poId,
  initialEta,
}: {
  poId: string;
  /** YYYY-MM-DD; null when no date is set yet. */
  initialEta: string | null;
}) {
  const router = useRouter();
  const [eta, setEta] = useState(initialEta ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/supplier/po/${poId}/eta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedDeliveryDate: eta ? eta : null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Couldn't save the ETA.");
      } else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <Input
        type="date"
        value={eta}
        onChange={(e) => {
          setEta(e.target.value);
          setSaved(false);
        }}
        className="h-8 w-40"
        aria-label="Expected delivery date"
      />
      <Button size="sm" variant="outline" disabled={saving} onClick={save}>
        {saving ? "Saving…" : "Save"}
      </Button>
      {saved && <span className="text-xs text-emerald-600">Saved</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
