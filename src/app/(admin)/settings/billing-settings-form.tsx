"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface BillingSettingsValues {
  bankName: string;
  accountName: string;
  accountNumber: string;
  routingNumber: string;
  swiftBic: string;
  iban: string;
  instructions: string;
}

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";

export function BillingSettingsForm({ initial }: { initial: BillingSettingsValues }) {
  const router = useRouter();
  const [v, setV] = useState<BillingSettingsValues>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof BillingSettingsValues>(k: K, val: string) {
    setV((prev) => ({ ...prev, [k]: val }));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/settings/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Couldn't save.");
      } else {
        setMsg("Saved.");
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={fieldLabel}>Bank name</label>
          <Input value={v.bankName} onChange={(e) => set("bankName", e.target.value)} />
        </div>
        <div>
          <label className={fieldLabel}>Account name</label>
          <Input value={v.accountName} onChange={(e) => set("accountName", e.target.value)} />
        </div>
        <div>
          <label className={fieldLabel}>Account number</label>
          <Input value={v.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} />
        </div>
        <div>
          <label className={fieldLabel}>Routing / ABA</label>
          <Input value={v.routingNumber} onChange={(e) => set("routingNumber", e.target.value)} />
        </div>
        <div>
          <label className={fieldLabel}>SWIFT / BIC</label>
          <Input value={v.swiftBic} onChange={(e) => set("swiftBic", e.target.value)} />
        </div>
        <div>
          <label className={fieldLabel}>IBAN</label>
          <Input value={v.iban} onChange={(e) => set("iban", e.target.value)} />
        </div>
      </div>
      <div>
        <label className={fieldLabel}>Instructions (optional)</label>
        <textarea
          value={v.instructions}
          onChange={(e) => set("instructions", e.target.value)}
          rows={2}
          placeholder="e.g. Reference your invoice number with the wire."
          className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
        />
      </div>
      <div className="flex items-center justify-end gap-3">
        {msg && <span className="text-sm text-emerald-700">{msg}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
