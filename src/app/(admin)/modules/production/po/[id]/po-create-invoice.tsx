"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Creates invoice(s) from this PO (one per bill-to company) and navigates to
// the result. Errors (e.g. no company on the PO) render under the button.
export function PoCreateInvoice({ poId }: { poId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/production/po/${poId}/invoice`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Couldn't create invoice.");
        setBusy(false);
        return;
      }
      const invoices: { id: string }[] = d.data?.invoices ?? [];
      router.push(invoices.length === 1 ? `/invoices/${invoices[0].id}` : "/invoices");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end">
      <Button variant="outline" size="sm" disabled={busy} onClick={create}>
        {busy ? "Creating…" : "Create invoice"}
      </Button>
      {error && (
        <span className="mt-1 max-w-[16rem] text-right text-xs text-red-600">{error}</span>
      )}
    </div>
  );
}
