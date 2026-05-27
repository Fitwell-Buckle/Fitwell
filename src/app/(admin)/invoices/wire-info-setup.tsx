"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

// "Setup" on the B2B Orders page → edit the Wire Info shown on invoices. Reuses
// the billing "instructions" free-text field; line breaks + bold are preserved
// on the invoice (print + email).
export function WireInfoSetup({ initialWireInfo }: { initialWireInfo: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialWireInfo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/settings/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions: value.trim() || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Couldn't save.");
      } else {
        setOpen(false);
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings className="h-4 w-4" />
        Setup
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Wire info"
        description="Free text shown (bold, line breaks preserved) on every B2B invoice — print and email."
      >
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={6}
          placeholder={"Bank: …\nAccount: …\nRouting: …\nReference: invoice #"}
          className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
