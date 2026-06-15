import { getBillingSettings } from "@/lib/invoicing/billing-settings";
import {
  INVOICE_STATUS_LABELS,
  consolidateLinesBySku,
  netLineDisplays,
  shippingAddressLines,
  type InvoiceStatus,
} from "@/lib/invoicing/invoicing";
import { fmtDate, fmtMoney } from "@/lib/production/display";
import { getStoreLogoUrl } from "@/lib/shopify/brand";
import { getShopifyClient } from "@/lib/shopify/client";
import { isSplitOrder, buildShipPlan } from "@/lib/portal/addresses";
import { ShipPlanCards } from "@/components/invoicing/ship-plan";
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

  const discountPercent = inv.discountPercent ?? 0;
  // One row per SKU — split fulfillment stores a line per destination, but the
  // invoice reads as a single consolidated row; the split is summarised below.
  const displayLines = consolidateLinesBySku(inv.lineItems);
  // Net (post-discount) prices the customer pays — shown instead of retail.
  // Foots exactly to inv.totalCents.
  const netLines = netLineDisplays(
    displayLines.map((l) => ({ quantity: l.quantity, unitPriceCents: l.unitPriceCents })),
    discountPercent,
    inv.totalCents,
  );
  // Split fulfillment: the per-address breakdown, shown under the line items.
  const shipPlan = isSplitOrder(inv.lineItems)
    ? buildShipPlan(inv.lineItems, inv.shipTo ?? null)
    : null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-8 print:border-0 print:p-0">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Invoice</h1>
          <div className="mt-1 font-mono text-sm text-zinc-500">{inv.invoiceNumber}</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="Fitwell" className="h-16 w-auto shrink-0 [filter:brightness(0)]" />
      </div>

      <div className="mt-8 grid grid-cols-3 gap-4 text-sm">
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
          {inv.company?.contactEmail && (
            <div className="break-words text-zinc-500">{inv.company.contactEmail}</div>
          )}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-400">Ship to</div>
          {(() => {
            const shipLines = shippingAddressLines(inv.shippingAddress);
            const fallback = inv.company?.address?.trim() || "";
            if (shipLines.length > 0) {
              return shipLines.map((line, i) => (
                <div
                  key={i}
                  className={i === 0 ? "mt-1 font-medium text-zinc-900" : "text-zinc-500"}
                >
                  {line}
                </div>
              ));
            }
            return (
              <div className="mt-1 whitespace-pre-line text-zinc-500">
                {fallback || "—"}
              </div>
            );
          })()}
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
            <th className="w-full pb-2 pr-6">Item</th>
            <th className="whitespace-nowrap pb-2 pl-6 text-right">Qty</th>
            <th className="whitespace-nowrap pb-2 pl-6 text-right">Unit</th>
            <th className="whitespace-nowrap pb-2 pl-6 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {displayLines.map((l, i) => (
            <tr key={`${l.sku} ${l.unitPriceCents}`} className="border-b border-zinc-100">
              <td className="py-2 pr-6 text-zinc-700">
                <span className="font-mono text-xs text-zinc-500">{l.sku}</span> — {l.title}
              </td>
              <td className="whitespace-nowrap py-2 pl-6 text-right text-zinc-500">
                {l.quantity}
              </td>
              <td className="whitespace-nowrap py-2 pl-6 text-right text-zinc-500">
                {fmtMoney(netLines[i].netUnitPriceCents)}
              </td>
              <td className="whitespace-nowrap py-2 pl-6 text-right text-zinc-700">
                {fmtMoney(netLines[i].netLineTotalCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 space-y-1 text-sm">
        {discountPercent > 0 && (
          <div className="flex justify-end gap-8 text-zinc-400">
            <span>Includes {discountPercent}% partner discount</span>
          </div>
        )}
        <div className="flex justify-end gap-8 text-base font-semibold text-zinc-900">
          <span>Total (USD)</span>
          <span className="w-32 text-right">{fmtMoney(inv.totalCents)}</span>
        </div>
      </div>

      {/* Split fulfillment: the per-address breakdown under the consolidated
          line items (the line items above read as one row per SKU). */}
      {shipPlan && (
        <div className="mt-6 border-t border-zinc-100 pt-4">
          <div className="text-xs uppercase tracking-wider text-zinc-400">
            Split fulfillment — shipped to {shipPlan.length} addresses
          </div>
          <ShipPlanCards groups={shipPlan} />
        </div>
      )}

      {inv.notes && <p className="mt-6 text-sm text-zinc-600">{inv.notes}</p>}

      <div className="mt-8 border-t border-zinc-200 pt-4 text-sm">
        <div className="text-xs uppercase tracking-wider text-zinc-400">Payment</div>
        {(() => {
          // Effective deposit terms at print time: an explicit per-invoice
          // override (snapshotted at send) wins; otherwise fall back to the
          // brand's current default so drafts/previews also show terms.
          const pct =
            inv.depositPercent ?? inv.company?.depositPercent ?? 0;
          if (pct <= 0) return null;
          const depositCents =
            inv.depositCents > 0
              ? inv.depositCents
              : Math.round((inv.totalCents * pct) / 100);
          const balanceCents = Math.max(0, inv.totalCents - depositCents);
          return (
            <p className="mt-1 text-zinc-700">
              A <span className="font-semibold">{pct}% deposit</span> (
              {fmtMoney(depositCents)}) is due now via wire or payment link. The
              remaining balance ({fmtMoney(balanceCents)}) will be billed when
              your order is fulfilled.
            </p>
          );
        })()}
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
        {billing?.instructions && (
          <p className="mt-2 whitespace-pre-line text-[10px] leading-snug text-zinc-500">
            {billing.instructions}
          </p>
        )}
      </div>

      <p className="mt-8 text-center text-lg font-medium text-zinc-700">
        Invoicing and Supply Chain Management by Fitwell Systems
      </p>
    </div>
  );
}
