// Pure, DB-free invoicing helpers: number formatting, money math, and grouping
// PO line items by their bill-to company. Kept side-effect-free for unit tests.

export const INVOICE_STATUSES = ["draft", "sent", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
};

export function invoiceStatusBadgeClass(status: string): string {
  switch (status) {
    case "draft":
      return "bg-zinc-100 text-zinc-600";
    case "sent":
      return "bg-blue-50 text-blue-700";
    case "paid":
      return "bg-emerald-50 text-emerald-700";
    case "void":
      return "bg-zinc-100 text-zinc-400";
    default:
      return "bg-zinc-100 text-zinc-600";
  }
}

/** Format a sequence value as an invoice number, e.g. 100 → "INV-00100". */
export function formatInvoiceNumber(n: number): string {
  return `INV-${String(n).padStart(5, "0")}`;
}

export interface PricedLine {
  quantity: number;
  unitPriceCents: number;
}

export interface InvoiceTotals {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

/**
 * Invoice money math. Subtotal = Σ(qty × unit retail); the company's tier
 * discount (a percentage, clamped 0–100) is applied to the whole invoice.
 */
export function computeInvoiceTotals(
  lines: PricedLine[],
  discountPercent: number,
): InvoiceTotals {
  const subtotalCents = lines.reduce(
    (sum, l) => sum + l.quantity * l.unitPriceCents,
    0,
  );
  const pct = Math.max(0, Math.min(100, discountPercent || 0));
  const discountCents = Math.round((subtotalCents * pct) / 100);
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}

/**
 * The net unit price a customer actually pays, after their tier discount
 * (percentage, clamped 0–100) is applied to the retail unit price and rounded
 * to the nearest cent. Used to show "the price they pay" on the invoice
 * document instead of retail.
 */
export function netUnitPriceCents(
  unitPriceCents: number,
  discountPercent: number,
): number {
  const pct = Math.max(0, Math.min(100, discountPercent || 0));
  return Math.round((unitPriceCents * (100 - pct)) / 100);
}

export interface NetLineDisplay {
  netUnitPriceCents: number;
  netLineTotalCents: number;
}

/**
 * Per-line net prices (what the customer pays) for display on the invoice
 * document. The discount is stored at the order level, so independently
 * rounding each line can drift a cent or two from the authoritative invoice
 * total; the drift is absorbed into the last line so the line-total column
 * always foots exactly to `totalCents` (the amount actually charged).
 */
export function netLineDisplays(
  lines: PricedLine[],
  discountPercent: number,
  totalCents: number,
): NetLineDisplay[] {
  const rows = lines.map((l) => ({
    netUnitPriceCents: netUnitPriceCents(l.unitPriceCents, discountPercent),
    netLineTotalCents: netUnitPriceCents(l.unitPriceCents * l.quantity, discountPercent),
  }));
  const sum = rows.reduce((acc, r) => acc + r.netLineTotalCents, 0);
  const drift = totalCents - sum;
  if (rows.length > 0 && drift !== 0) {
    rows[rows.length - 1].netLineTotalCents += drift;
  }
  return rows;
}

export interface DepositSplit {
  depositCents: number;
  balanceCents: number;
}

/**
 * Split an order total into a deposit due now + a balance due at fulfillment,
 * given the brand's deposit percentage (clamped 0–100). 0% = no deposit (the
 * whole amount is the balance / a single payment). The deposit rounds to the
 * nearest cent; the balance is the remainder so the two always sum to total.
 */
export function computeDeposit(
  totalCents: number,
  depositPercent: number | null | undefined,
): DepositSplit {
  const pct = Math.max(0, Math.min(100, depositPercent || 0));
  if (pct <= 0) return { depositCents: 0, balanceCents: totalCents };
  const depositCents = Math.round((totalCents * pct) / 100);
  return { depositCents, balanceCents: totalCents - depositCents };
}

/**
 * Group items by their bill-to company key. Items whose key is null/empty have
 * no company to invoice and are returned separately (the caller warns).
 */
export function groupByCompany<T>(
  items: T[],
  keyOf: (item: T) => string | null | undefined,
): { groups: { companyId: string; items: T[] }[]; unassigned: T[] } {
  const map = new Map<string, T[]>();
  const unassigned: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (!key) {
      unassigned.push(item);
      continue;
    }
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return {
    groups: [...map.entries()].map(([companyId, items]) => ({ companyId, items })),
    unassigned,
  };
}
