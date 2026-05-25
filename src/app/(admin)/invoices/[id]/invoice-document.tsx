import { getBillingSettings, hasRemittance } from "@/lib/invoicing/billing-settings";
import { remittanceRows } from "@/lib/invoicing/email";
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from "@/lib/invoicing/invoicing";
import { fmtDate, fmtMoney } from "@/lib/production/display";
import { getStoreLogoUrl } from "@/lib/shopify/brand";
import { getShopifyClient } from "@/lib/shopify/client";
import type { getInvoiceDetail } from "@/lib/invoicing/service";

type Invoice = NonNullable<Awaited<ReturnType<typeof getInvoiceDetail>>>;

/**
 * The printable invoice document (From/Bill-to, line items, totals, payment +
 * bank-wire block). Shared by the Print and Print & Send pages so they stay in
 * sync. Async server component — fetches the store's brand details itself.
 */
export async function InvoiceDocument({ inv }: { inv: Invoice }) {
  const [billing, logoUrl] = await Promise.all([
    getBillingSettings(),
    getStoreLogoUrl(),
  ]);

  let shop: Awaited<ReturnType<ReturnType<typeof getShopifyClient>["getShop"]>> | null = null;
  try {
    shop = await getShopifyClient().getShop();
  } catch {
    shop = null;
  }

  const fromAddress = [
    shop?.address1,
    shop?.address2,
    [shop?.city, shop?.province, shop?.zip].filter(Boolean).join(", "),
    shop?.country,
  ].filter(Boolean);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-8 print:border-0 print:p-0">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Invoice</h1>
          <div className="mt-1 font-mono text-sm text-zinc-500">{inv.invoiceNumber}</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="Fitwell" className="h-8 w-auto shrink-0 [filter:brightness(0)]" />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-6 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-400">From</div>
          <div className="mt-1 font-medium text-zinc-900">{shop?.name ?? "Fitwell Buckle Co."}</div>
          {fromAddress.map((line, i) => (
            <div key={i} className="text-zinc-500">{line}</div>
          ))}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-400">Bill to</div>
          <div className="mt-1 font-medium text-zinc-900">{inv.company?.name ?? "—"}</div>
          {inv.company?.contactName && <div className="text-zinc-500">{inv.company.contactName}</div>}
          {inv.company?.contactEmail && <div className="text-zinc-500">{inv.company.contactEmail}</div>}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-x-8 gap-y-1 border-y border-zinc-100 py-3 text-sm text-zinc-600">
        <span>Issued: {fmtDate(inv.issuedDate)}</span>
        {inv.dueDate && <span>Due: {fmtDate(inv.dueDate)}</span>}
        <span>Status: {INVOICE_STATUS_LABELS[inv.status as InvoiceStatus] ?? inv.status}</span>
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-400">
            <th className="pb-2">Item</th>
            <th className="pb-2 text-right">Qty</th>
            <th className="pb-2 text-right">Unit</th>
            <th className="pb-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {inv.lineItems.map((l) => (
            <tr key={l.id} className="border-b border-zinc-100">
              <td className="py-2 text-zinc-700">
                <span className="font-mono text-xs text-zinc-500">{l.sku}</span> — {l.title}
              </td>
              <td className="py-2 text-right text-zinc-500">{l.quantity}</td>
              <td className="py-2 text-right text-zinc-500">{fmtMoney(l.unitPriceCents)}</td>
              <td className="py-2 text-right text-zinc-700">
                {fmtMoney(l.unitPriceCents * l.quantity)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 space-y-1 text-sm">
        <div className="flex justify-end gap-8 text-zinc-500">
          <span>Subtotal</span>
          <span className="w-32 text-right text-zinc-700">{fmtMoney(inv.subtotalCents)}</span>
        </div>
        <div className="flex justify-end gap-8 text-zinc-500">
          <span>Discount ({inv.discountPercent ?? 0}%)</span>
          <span className="w-32 text-right text-zinc-700">−{fmtMoney(inv.discountCents)}</span>
        </div>
        <div className="flex justify-end gap-8 text-base font-semibold text-zinc-900">
          <span>Total</span>
          <span className="w-32 text-right">{fmtMoney(inv.totalCents)}</span>
        </div>
      </div>

      {inv.notes && <p className="mt-6 text-sm text-zinc-600">{inv.notes}</p>}

      <div className="mt-8 border-t border-zinc-200 pt-4 text-sm">
        <div className="text-xs uppercase tracking-wider text-zinc-400">Payment</div>
        {inv.shopifyInvoiceUrl && (
          <p className="mt-1 text-zinc-700">
            Pay online (Apple Pay, PayPal, card):{" "}
            <a
              href={inv.shopifyInvoiceUrl}
              className="break-all text-blue-600 underline underline-offset-2"
            >
              {inv.shopifyInvoiceUrl}
            </a>
          </p>
        )}
        {hasRemittance(billing) && (
          <div className="mt-2">
            <div className="text-zinc-500">Bank wire / ACH:</div>
            {remittanceRows(billing!).map((r) => (
              <div key={r.label} className="text-zinc-700">
                <span className="text-zinc-400">{r.label}:</span> {r.value}
              </div>
            ))}
            {billing!.instructions && (
              <p className="mt-1 text-xs text-zinc-500">{billing!.instructions}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
