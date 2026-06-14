import { fmtDate, fmtMoney } from "@/lib/production/display";
import { netLineDisplays } from "./invoicing";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Shared email chrome ─────────────────────────────────────────────
// The container, line-item table, and pay/wire blocks below are shared by the
// B2B invoice emails and the influencer gifting email so the look stays
// identical — edit a helper once and every order email changes together.

/** Outer branded container all order emails sit inside. */
function pageShell(inner: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#18181b">${inner}
  </div>`;
}

/** Heading + the muted sub-lines under it (sender, who it's for, dates). */
function headingHtml(title: string, subLines: string[]): string {
  const subs = subLines
    .filter(Boolean)
    .map(
      (s, i) =>
        `\n    <p style="font-size:13px;color:#71717a;margin:${i === 0 ? "4px" : "2px"} 0 0">${s}</p>`,
    )
    .join("");
  return `\n    <h1 style="font-size:18px;font-weight:600;margin:0">${title}</h1>${subs}`;
}

/** Optional personal note shown above the line items. */
function messageHtml(message: string | null | undefined): string {
  return message
    ? `\n    <p style="font-size:14px;color:#3f3f46;margin:18px 0 0;white-space:pre-wrap">${message}</p>`
    : "";
}

/**
 * The 4-column line-item table (Item / Qty / unit / Total). Callers pass the
 * cents to show per line, so an invoice can show net (post-discount) prices
 * while a gift shows the retail gift value — same table, different numbers.
 */
function lineItemsTableHtml(
  lineItems: { sku: string; title: string; quantity: number }[],
  cells: { unitCents: number; totalCents: number }[],
  unitLabel: string,
): string {
  const rows = lineItems
    .map(
      (l, i) => `
      <tr>
        <td style="padding:6px 16px 6px 0;color:#52525b;font-size:13px">${l.sku} — ${l.title}</td>
        <td style="padding:6px 0 6px 24px;text-align:right;color:#52525b;font-size:13px;white-space:nowrap">${l.quantity}</td>
        <td style="padding:6px 0 6px 24px;text-align:right;color:#52525b;font-size:13px;white-space:nowrap">${fmtMoney(cells[i].unitCents)}</td>
        <td style="padding:6px 0 6px 24px;text-align:right;color:#18181b;font-size:13px;white-space:nowrap">${fmtMoney(cells[i].totalCents)}</td>
      </tr>`,
    )
    .join("");
  return `
    <table style="width:100%;border-collapse:collapse;margin-top:20px">
      <thead>
        <tr style="border-bottom:1px solid #e4e4e7">
          <th style="text-align:left;font-size:11px;color:#a1a1aa;text-transform:uppercase;padding:0 16px 6px 0">Item</th>
          <th style="text-align:right;font-size:11px;color:#a1a1aa;text-transform:uppercase;padding:0 0 6px 24px">Qty</th>
          <th style="text-align:right;font-size:11px;color:#a1a1aa;text-transform:uppercase;padding:0 0 6px 24px">${unitLabel}</th>
          <th style="text-align:right;font-size:11px;color:#a1a1aa;text-transform:uppercase;padding:0 0 6px 24px">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/** Dark CTA button (payment links). Empty string when there's no url. */
function payButtonHtml(url: string | null | undefined, label: string): string {
  return url
    ? `<p style="margin:20px 0 0">
         <a href="${url}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:6px">${label}</a>
       </p>`
    : "";
}

/** Bank-wire / ACH remittance block. Empty string when no instructions. */
function remittanceHtml(instructions: string | null | undefined): string {
  return instructions
    ? `<div style="margin-top:20px;border-top:1px solid #e4e4e7;padding-top:12px">
           <div style="font-size:11px;color:#a1a1aa;text-transform:uppercase">Pay by bank wire / ACH</div>
           <div style="font-size:13px;color:#18181b;font-weight:700;margin-top:6px">${escapeHtml(instructions).replace(/\n/g, "<br>")}</div>
         </div>`
    : "";
}

// ─── B2B invoice email ───────────────────────────────────────────────

interface InvoiceEmailData {
  invoiceNumber: string;
  companyName: string;
  issuedDate: string;
  dueDate: string | null;
  discountPercent: number | null;
  totalCents: number;
  notes: string | null;
  lineItems: { sku: string; title: string; quantity: number; unitPriceCents: number }[];
  payUrl?: string | null;
  /** Free-text bank-wire / payment instructions (line breaks + bold preserved). */
  instructions?: string | null;
  /** Optional personal note from the sender, shown above the line items. */
  message?: string | null;
}

/** Branded HTML for a B2B invoice email. */
export function buildInvoiceEmailHtml(inv: InvoiceEmailData): string {
  const discountPercent = inv.discountPercent ?? 0;
  // Net (post-discount) prices the customer pays — shown instead of retail.
  // Foots exactly to inv.totalCents.
  const netLines = netLineDisplays(
    inv.lineItems.map((l) => ({ quantity: l.quantity, unitPriceCents: l.unitPriceCents })),
    discountPercent,
    inv.totalCents,
  );
  const table = lineItemsTableHtml(
    inv.lineItems,
    netLines.map((n) => ({ unitCents: n.netUnitPriceCents, totalCents: n.netLineTotalCents })),
    "Unit",
  );

  const totals = `
    <div style="margin-top:16px;border-top:1px solid #e4e4e7;padding-top:12px;font-size:13px">
      ${discountPercent > 0 ? `<div style="display:flex;justify-content:space-between;color:#a1a1aa"><span>Includes ${discountPercent}% partner discount</span><span></span></div>` : ""}
      <div style="display:flex;justify-content:space-between;font-weight:600;font-size:15px;margin-top:4px"><span>Total (USD)</span><span>${fmtMoney(inv.totalCents)}</span></div>
    </div>`;

  return pageShell(
    headingHtml(`Invoice ${inv.invoiceNumber}`, [
      `Fitwell Buckle Co. · Billed to ${inv.companyName}`,
      `Issued ${fmtDate(inv.issuedDate)}${inv.dueDate ? ` · Due ${fmtDate(inv.dueDate)}` : ""}`,
    ]) +
      messageHtml(inv.message) +
      `\n${table}\n${totals}\n` +
      (inv.notes ? `    <p style="font-size:13px;color:#52525b;margin-top:16px">${inv.notes}</p>\n` : "") +
      `    ${payButtonHtml(inv.payUrl, "Pay online (Apple Pay, PayPal, card)")}\n` +
      `    ${remittanceHtml(inv.instructions)}`,
  );
}

// ─── B2B balance-due email ───────────────────────────────────────────

interface BalanceEmailData {
  invoiceNumber: string;
  companyName: string;
  balanceCents: number;
  payUrl: string | null;
  /** Free-text bank-wire / payment instructions (line breaks + bold preserved). */
  instructions?: string | null;
  /** Optional personal note from the sender, shown above the balance line. */
  message?: string | null;
}

/**
 * Branded HTML for the balance-due email sent when a B2B invoice is marked
 * fulfilled. Simpler than buildInvoiceEmailHtml — no line items, just the
 * remaining balance + pay link + wire fallback.
 */
export function buildBalanceEmailHtml(inv: BalanceEmailData): string {
  const balance = `
    <p style="font-size:14px;color:#3f3f46;margin:18px 0 0">
      Your order has been fulfilled. The remaining balance is due now.
    </p>${messageHtml(inv.message)}
    <div style="margin-top:18px;border-top:1px solid #e4e4e7;padding-top:14px">
      <div style="display:flex;justify-content:space-between;font-weight:600;font-size:16px">
        <span>Balance due (USD)</span>
        <span>${fmtMoney(inv.balanceCents)}</span>
      </div>
    </div>`;

  return pageShell(
    headingHtml(`Balance due — Invoice ${inv.invoiceNumber}`, [
      `Fitwell Buckle Co. · Billed to ${inv.companyName}`,
    ]) +
      balance +
      `\n    ${payButtonHtml(inv.payUrl, "Pay balance online (Apple Pay, PayPal, card)")}\n` +
      `    ${remittanceHtml(inv.instructions)}`,
  );
}

// ─── Influencer gifting email ────────────────────────────────────────

interface GiftEmailData {
  orderNumber: string;
  influencerName: string;
  issuedDate: string;
  /** When the creator's content is due (the deadline), if set. */
  contentDueDate?: string | null;
  /** The affiliate / tracking link for this gifting, if set. */
  affiliateLink?: string | null;
  /** Retail gift value of the lines (the subtotal). */
  subtotalCents: number;
  notes?: string | null;
  lineItems: { sku: string; title: string; quantity: number; unitPriceCents: number }[];
  /** Optional personal note from the sender, shown above the line items. */
  message?: string | null;
}

/**
 * Branded HTML for an influencer gifting email. Reuses the shared shell, heading
 * and line-item table so it looks like the invoice email, but shows the retail
 * gift value (not net), carries no payment/wire blocks (it's 100% off), and adds
 * the content deadline + affiliate-tracking link.
 */
export function buildGiftEmailHtml(g: GiftEmailData): string {
  const table = lineItemsTableHtml(
    g.lineItems,
    g.lineItems.map((l) => ({
      unitCents: l.unitPriceCents,
      totalCents: l.unitPriceCents * l.quantity,
    })),
    "Gift value",
  );

  const totals = `
    <div style="margin-top:16px;border-top:1px solid #e4e4e7;padding-top:12px;font-size:13px">
      <div style="display:flex;justify-content:space-between;color:#a1a1aa"><span>Gift value (USD)</span><span>${fmtMoney(g.subtotalCents)}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:600;font-size:15px;margin-top:4px"><span>You pay</span><span>$0.00</span></div>
    </div>`;

  const deadline = g.contentDueDate
    ? `\n    <p style="font-size:13px;color:#52525b;margin-top:16px">Please publish your content by <strong>${fmtDate(g.contentDueDate)}</strong>.</p>`
    : "";
  const affiliate = g.affiliateLink
    ? `\n    <p style="font-size:13px;color:#52525b;margin-top:8px">Your tracking link: <a href="${g.affiliateLink}" style="color:#18181b">${g.affiliateLink}</a></p>`
    : "";

  return pageShell(
    headingHtml("Your gift from Fitwell Buckle Co.", [
      `Gifting order ${g.orderNumber} · For ${g.influencerName}`,
      `Issued ${fmtDate(g.issuedDate)}`,
    ]) +
      messageHtml(g.message) +
      `\n${table}\n${totals}` +
      deadline +
      affiliate +
      (g.notes ? `\n    <p style="font-size:13px;color:#52525b;margin-top:16px">${g.notes}</p>` : ""),
  );
}
