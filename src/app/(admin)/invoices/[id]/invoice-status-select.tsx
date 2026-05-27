"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  type InvoiceStatus,
} from "@/lib/invoicing/invoicing";

// Editable invoice status, shown in the page header.
export function InvoiceStatusSelect({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setStatus(next: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-xs text-zinc-500">Status</span>
      <select
        value={status}
        disabled={busy}
        onChange={(e) => setStatus(e.target.value)}
        className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300"
      >
        {INVOICE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {INVOICE_STATUS_LABELS[s as InvoiceStatus]}
          </option>
        ))}
      </select>
    </label>
  );
}
