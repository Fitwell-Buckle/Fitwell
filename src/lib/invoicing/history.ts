// Derives an invoice's history timeline from the timestamps already stored on
// the invoice row (no separate event table). Pure + serialization-ready so the
// invoice page can render a chronological feed. Each entry is a milestone that
// actually happened (its timestamp is set).

export interface InvoiceTimestamps {
  createdAt: Date | null;
  sentAt: Date | null;
  depositPaidAt: Date | null;
  fulfilledAt: Date | null;
  balancePaidAt: Date | null;
  paidAt: Date | null;
}

export interface InvoiceHistoryEntry {
  at: string; // ISO
  label: string;
}

export function buildInvoiceHistory(
  ts: InvoiceTimestamps,
  opts: { companyName?: string | null } = {},
): InvoiceHistoryEntry[] {
  const to = opts.companyName ? ` to ${opts.companyName}` : "";
  const candidates: { at: Date | null; label: string }[] = [
    { at: ts.createdAt, label: "Invoice created" },
    { at: ts.sentAt, label: `Invoice sent${to}` },
    { at: ts.depositPaidAt, label: "Deposit paid" },
    { at: ts.fulfilledAt, label: "Marked fulfilled — balance billed" },
    { at: ts.balancePaidAt, label: "Balance paid" },
    { at: ts.paidAt, label: "Paid in full" },
  ];

  return candidates
    .filter((c): c is { at: Date; label: string } => c.at != null)
    .map((c) => ({ at: c.at.toISOString(), label: c.label }))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}
