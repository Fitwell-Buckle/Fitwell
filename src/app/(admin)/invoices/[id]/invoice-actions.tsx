"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtMoney } from "@/lib/production/display";

export function InvoiceActions({
  invoiceId,
  canPushShopify,
  shopifyInvoiceUrl,
  depositPercent,
  depositCents,
  balanceCents,
  fulfilledAt,
  balanceInvoiceUrl,
}: {
  invoiceId: string;
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

  return (
    <Card className="mt-5 p-6">
      <h2 className="text-sm font-semibold text-zinc-900">Collect Payment</h2>

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
          Link this customer to a Shopify customer (Customers → B2B Customer List) to
          also create a Shopify draft order with a payment link when sending.
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
