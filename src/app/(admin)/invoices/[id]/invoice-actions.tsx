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
  status,
  paidAt,
  depositPaidAt,
  balancePaidAt,
  projectedDepositPercent,
  projectedDepositCents,
  totalCents,
}: {
  invoiceId: string;
  canPushShopify: boolean;
  shopifyInvoiceUrl: string | null;
  depositPercent: number | null;
  depositCents: number;
  balanceCents: number;
  fulfilledAt: string | null;
  balanceInvoiceUrl: string | null;
  status: string;
  paidAt: string | null;
  depositPaidAt: string | null;
  balancePaidAt: string | null;
  /** Effective deposit % at send time (invoice override or brand default).
   *  Used to show the projection on drafts before any snapshot exists. */
  projectedDepositPercent: number | null;
  /** Projected deposit amount in cents at send time. */
  projectedDepositCents: number;
  /** Full invoice total — used to compute the projected balance. */
  totalCents: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "fulfill" | "deposit" | "balance">(null);
  const [error, setError] = useState<string | null>(null);

  // status === "paid" is the coarse "everything paid" signal (e.g. the user
  // flipped the status dropdown at the top of the page). The individual
  // depositPaidAt / balancePaidAt timestamps are finer-grained — set by the
  // "Mark deposit paid" / "Mark balance paid" buttons below, or by a future
  // Shopify webhook.
  const isFullyPaid = status === "paid";
  const depositPaid = !!depositPaidAt || isFullyPaid;
  const balancePaid = !!balancePaidAt || isFullyPaid;
  // The date to show next to the paid indicators when we don't have a
  // specific timestamp for the individual payment (e.g. status flipped to
  // "paid" without going through the granular buttons).
  const depositPaidDate = depositPaidAt ?? (isFullyPaid ? paidAt : null);
  const balancePaidDate = balancePaidAt ?? (isFullyPaid ? paidAt : null);

  async function callApi(
    path: string,
    kind: NonNullable<typeof busy>,
    genericError: string,
  ) {
    setError(null);
    setBusy(kind);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/${path}`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || genericError);
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(null);
    }
  }
  const fulfill = () => callApi("fulfill", "fulfill", "Couldn't mark fulfilled.");
  const markDepositPaid = () =>
    callApi("deposit-paid", "deposit", "Couldn't mark deposit paid.");
  const markBalancePaid = () =>
    callApi("balance-paid", "balance", "Couldn't mark balance paid.");

  // For invoices with no deposit, the only "payment" state is the overall
  // status flip. Show a simple paid indicator above the (now hidden) link.
  const fullPaymentPaid = depositCents === 0 && isFullyPaid;

  const isDraft = status === "draft";
  const projectedBalanceCents = Math.max(0, totalCents - projectedDepositCents);

  return (
    <Card className="mt-5 p-6">
      <h2 className="text-sm font-semibold text-zinc-900">
        {isDraft ? "Payment preview" : "Collect Payment"}
      </h2>

      {/* Draft: show what the customer will see when sent. Nothing is collectable
       *  yet, so no mark-paid buttons — purely informational. Hidden once sent. */}
      {isDraft && (
        <div className="mt-4 space-y-1 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            When this invoice is sent
          </div>
          {projectedDepositCents > 0 ? (
            <>
              <div>
                Deposit due up front
                {projectedDepositPercent != null
                  ? ` (${projectedDepositPercent}%)`
                  : ""}
                : <span className="font-medium text-zinc-900">{fmtMoney(projectedDepositCents)}</span>
              </div>
              <div>
                Balance billed on fulfillment:{" "}
                <span className="font-medium text-zinc-900">
                  {fmtMoney(projectedBalanceCents)}
                </span>
              </div>
            </>
          ) : (
            <div>
              Single payment of{" "}
              <span className="font-medium text-zinc-900">
                {fmtMoney(totalCents)}
              </span>{" "}
              due on send.
            </div>
          )}
        </div>
      )}

      {depositCents > 0 && (
        <div className="mt-4 space-y-2 rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-sm">
          <div className="font-medium text-zinc-900">
            Deposit billing{depositPercent ? ` — ${depositPercent}%` : ""}
          </div>

          {/* ─── Deposit row ─── */}
          {depositPaid ? (
            <div className="flex flex-wrap items-center gap-2 text-emerald-700">
              <span>
                ✓ Deposit ({fmtMoney(depositCents)}) paid
                {depositPaidDate ? ` ${depositPaidDate}` : ""}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-zinc-600">
              <span>Deposit due now: {fmtMoney(depositCents)}</span>
              {shopifyInvoiceUrl && (
                <>
                  <span className="text-zinc-300">·</span>
                  <a
                    href={shopifyInvoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline underline-offset-2"
                  >
                    deposit payment link
                  </a>
                </>
              )}
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                disabled={busy !== null}
                onClick={markDepositPaid}
              >
                {busy === "deposit" ? "Marking…" : "Mark deposit paid"}
              </Button>
            </div>
          )}

          {/* ─── Balance row ─── */}
          {balancePaid ? (
            <div className="flex flex-wrap items-center gap-2 text-emerald-700">
              <span>
                ✓ Final payment ({fmtMoney(balanceCents)}) received
                {balancePaidDate ? ` ${balancePaidDate}` : ""}
              </span>
            </div>
          ) : fulfilledAt ? (
            <div className="flex flex-wrap items-center gap-2 text-zinc-600">
              <span className="text-emerald-700">✓ Fulfilled {fulfilledAt}</span>
              <span className="text-zinc-300">·</span>
              <span>balance: {fmtMoney(balanceCents)}</span>
              {balanceInvoiceUrl && (
                <>
                  <span className="text-zinc-300">·</span>
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
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                disabled={busy !== null}
                onClick={markBalancePaid}
              >
                {busy === "balance" ? "Marking…" : "Mark balance paid"}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-zinc-600">
              <span>Balance on fulfillment: {fmtMoney(balanceCents)}</span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                disabled={busy !== null}
                onClick={fulfill}
              >
                {busy === "fulfill" ? "Working…" : "Mark fulfilled & bill balance"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Full-payment (no deposit) indicator. We don't add a granular "mark
          paid" button here because the status dropdown at the top of the page
          already serves that role for the one-payment case. */}
      {fullPaymentPaid && (
        <p className="mt-3 text-sm text-emerald-700">
          ✓ Paid{paidAt ? ` ${paidAt}` : ""}
        </p>
      )}

      {!canPushShopify && (
        <p className="mt-3 text-xs text-zinc-400">
          Link this customer to a Shopify customer (Customers → B2B Customer List) to
          also create a Shopify draft order with a payment link when sending.
        </p>
      )}

      {/* Original payment link only when nothing has been paid AND we don't
          have a balance link yet AND we're not in the deposit flow (where the
          link is shown inline above). */}
      {shopifyInvoiceUrl &&
        !balanceInvoiceUrl &&
        depositCents === 0 &&
        !isFullyPaid && (
          <p className="mt-2 text-sm">
            Payment link:{" "}
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
