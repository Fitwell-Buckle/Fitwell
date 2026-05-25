import { fmtDate, fmtMoney } from "@/lib/production/display";

export interface InvoiceRemittance {
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  routingNumber: string | null;
  swiftBic: string | null;
  iban: string | null;
  instructions: string | null;
}

interface InvoiceEmailData {
  invoiceNumber: string;
  companyName: string;
  issuedDate: string;
  dueDate: string | null;
  subtotalCents: number;
  discountPercent: number | null;
  discountCents: number;
  totalCents: number;
  notes: string | null;
  lineItems: { sku: string; title: string; quantity: number; unitPriceCents: number }[];
  payUrl?: string | null;
  remittance?: InvoiceRemittance | null;
}

/** Render the bank-wire block (shared by email + printable doc). */
export function remittanceRows(r: InvoiceRemittance): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (r.bankName) rows.push({ label: "Bank", value: r.bankName });
  if (r.accountName) rows.push({ label: "Account name", value: r.accountName });
  if (r.accountNumber) rows.push({ label: "Account #", value: r.accountNumber });
  if (r.routingNumber) rows.push({ label: "Routing / ABA", value: r.routingNumber });
  if (r.swiftBic) rows.push({ label: "SWIFT / BIC", value: r.swiftBic });
  if (r.iban) rows.push({ label: "IBAN", value: r.iban });
  return rows;
}

/** Branded HTML for a B2B invoice email. */
export function buildInvoiceEmailHtml(inv: InvoiceEmailData): string {
  const rows = inv.lineItems
    .map(
      (l) => `
      <tr>
        <td style="padding:6px 0;color:#52525b;font-size:13px">${l.sku} — ${l.title}</td>
        <td style="padding:6px 0;text-align:right;color:#52525b;font-size:13px">${l.quantity}</td>
        <td style="padding:6px 0;text-align:right;color:#52525b;font-size:13px">${fmtMoney(l.unitPriceCents)}</td>
        <td style="padding:6px 0;text-align:right;color:#18181b;font-size:13px">${fmtMoney(l.unitPriceCents * l.quantity)}</td>
      </tr>`,
    )
    .join("");

  const payBlock = inv.payUrl
    ? `<p style="margin:20px 0 0">
         <a href="${inv.payUrl}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:6px">Pay online (Apple Pay, PayPal, card)</a>
       </p>`
    : "";

  const remittance =
    inv.remittance && remittanceRows(inv.remittance).length > 0
      ? `<div style="margin-top:20px;border-top:1px solid #e4e4e7;padding-top:12px">
           <div style="font-size:11px;color:#a1a1aa;text-transform:uppercase">Pay by bank wire / ACH</div>
           ${remittanceRows(inv.remittance)
             .map(
               (r) =>
                 `<div style="font-size:13px;color:#52525b"><span style="color:#a1a1aa">${r.label}:</span> ${r.value}</div>`,
             )
             .join("")}
           ${inv.remittance.instructions ? `<div style="font-size:12px;color:#71717a;margin-top:4px">${inv.remittance.instructions}</div>` : ""}
         </div>`
      : "";

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#18181b">
    <h1 style="font-size:18px;font-weight:600;margin:0">Invoice ${inv.invoiceNumber}</h1>
    <p style="font-size:13px;color:#71717a;margin:4px 0 0">
      Fitwell Buckle Co. · Billed to ${inv.companyName}
    </p>
    <p style="font-size:13px;color:#71717a;margin:2px 0 0">
      Issued ${fmtDate(inv.issuedDate)}${inv.dueDate ? ` · Due ${fmtDate(inv.dueDate)}` : ""}
    </p>

    <table style="width:100%;border-collapse:collapse;margin-top:20px">
      <thead>
        <tr style="border-bottom:1px solid #e4e4e7">
          <th style="text-align:left;font-size:11px;color:#a1a1aa;text-transform:uppercase;padding-bottom:6px">Item</th>
          <th style="text-align:right;font-size:11px;color:#a1a1aa;text-transform:uppercase;padding-bottom:6px">Qty</th>
          <th style="text-align:right;font-size:11px;color:#a1a1aa;text-transform:uppercase;padding-bottom:6px">Unit</th>
          <th style="text-align:right;font-size:11px;color:#a1a1aa;text-transform:uppercase;padding-bottom:6px">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="margin-top:16px;border-top:1px solid #e4e4e7;padding-top:12px;font-size:13px">
      <div style="display:flex;justify-content:space-between;color:#71717a"><span>Subtotal</span><span>${fmtMoney(inv.subtotalCents)}</span></div>
      <div style="display:flex;justify-content:space-between;color:#71717a"><span>Discount (${inv.discountPercent ?? 0}%)</span><span>−${fmtMoney(inv.discountCents)}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:600;font-size:15px;margin-top:4px"><span>Total</span><span>${fmtMoney(inv.totalCents)}</span></div>
    </div>

    ${inv.notes ? `<p style="font-size:13px;color:#52525b;margin-top:16px">${inv.notes}</p>` : ""}
    ${payBlock}
    ${remittance}
  </div>`;
}
