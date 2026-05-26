"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  type InvoiceStatus,
} from "@/lib/invoicing/invoicing";
import { fmtMoney } from "@/lib/production/display";

const selectCls =
  "h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300";

export function InvoiceActions({
  invoiceId,
  status,
  suppliers,
  canPushShopify,
  shopifyInvoiceUrl,
  depositPercent,
  depositCents,
  balanceCents,
  fulfilledAt,
  balanceInvoiceUrl,
}: {
  invoiceId: string;
  status: string;
  suppliers: { id: string; name: string }[];
  canPushShopify: boolean;
  shopifyInvoiceUrl: string | null;
  depositPercent: number | null;
  depositCents: number;
  balanceCents: number;
  fulfilledAt: string | null;
  balanceInvoiceUrl: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");

  async function fulfill() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/fulfill`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Couldn't mark fulfilled.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(next: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Couldn't update status.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function createPo() {
    if (!supplierId) return setError("Pick a supplier.");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/create-po`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Couldn't create PO.");
        setBusy(false);
        return;
      }
      router.push(`/modules/production/po/${d.data.poId}`);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5 p-6">
      <h2 className="text-sm font-semibold text-zinc-900">Actions</h2>

      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
        <label className="flex flex-col gap-1 text-sm text-zinc-600">
          <span className="text-xs text-zinc-500">Status</span>
          <select
            value={status}
            disabled={busy}
            onChange={(e) => setStatus(e.target.value)}
            className={selectCls}
          >
            {INVOICE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {INVOICE_STATUS_LABELS[s as InvoiceStatus]}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Create production PO</span>
          <div className="flex items-center gap-2">
            <select
              value={supplierId}
              disabled={busy || suppliers.length === 0}
              onChange={(e) => setSupplierId(e.target.value)}
              className={selectCls}
            >
              {suppliers.length === 0 && <option value="">No suppliers</option>}
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || suppliers.length === 0}
              onClick={createPo}
            >
              Create PO
            </Button>
          </div>
        </div>

      </div>

      {depositCents > 0 && (
        <div className="mt-4 rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-sm">
          <div className="font-medium text-zinc-900">
            Deposit billing{depositPercent ? ` — ${depositPercent}%` : ""}
          </div>
          <div className="mt-1 text-zinc-600">
            Deposit due now: {fmtMoney(depositCents)} · Balance on fulfillment:{" "}
            {fmtMoney(balanceCents)}
          </div>
          {fulfilledAt ? (
            <div className="mt-2 text-emerald-700">
              ✓ Fulfilled {fulfilledAt}
              {balanceInvoiceUrl && (
                <>
                  {" — "}
                  <a
                    href={balanceInvoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline underline-offset-2"
                  >
                    balance payment link
                  </a>
                </>
              )}
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={busy}
              onClick={fulfill}
            >
              Mark fulfilled &amp; bill balance
            </Button>
          )}
        </div>
      )}

      {!canPushShopify && (
        <p className="mt-3 text-xs text-zinc-400">
          Link this brand to a Shopify customer (Customers → B2B Brand List) to also
          create a Shopify draft order with a payment link when sending.
        </p>
      )}
      {shopifyInvoiceUrl && (
        <p className="mt-2 text-sm">
          Shopify payment link:{" "}
          <a
            href={shopifyInvoiceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 underline underline-offset-2"
          >
            open
          </a>
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
