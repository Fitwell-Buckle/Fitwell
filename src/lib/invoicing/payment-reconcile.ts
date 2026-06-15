// Pure helpers for reconciling a completed Shopify draft order back to a B2B
// invoice's payment state. A portal order's pay-link is a Shopify draft-order
// invoice; when it's paid the draft order's status becomes "completed". Deposit
// orders have TWO drafts (main = deposit, balance = the rest), so a completed
// draft can mean a deposit, a balance, or a full payment depending on which id
// it matches. Kept DB-free so the decision is unit-tested directly.

export type PaymentKind = "deposit" | "balance" | "full";

export interface ReconcileInvoice {
  shopifyDraftOrderId: string | null;
  shopifyBalanceDraftOrderId: string | null;
  depositCents: number;
  depositPaidAt: Date | null;
}

/**
 * Which payment a completed draft order represents for this invoice, or null if
 * it doesn't match either of the invoice's drafts. The balance draft is checked
 * first; the main draft is a "deposit" only when the invoice has an outstanding
 * deposit, otherwise it's the "full" payment.
 */
export function classifyDraftPayment(
  inv: ReconcileInvoice,
  draftOrderId: string,
): PaymentKind | null {
  if (inv.shopifyBalanceDraftOrderId && inv.shopifyBalanceDraftOrderId === draftOrderId) {
    return "balance";
  }
  if (inv.shopifyDraftOrderId && inv.shopifyDraftOrderId === draftOrderId) {
    return inv.depositCents > 0 && !inv.depositPaidAt ? "deposit" : "full";
  }
  return null;
}

/** The amount a given payment covers, for the notification copy. */
export function paymentAmountCents(
  totalCents: number,
  depositCents: number,
  kind: PaymentKind,
): number {
  if (kind === "deposit") return depositCents;
  if (kind === "balance") return Math.max(0, totalCents - depositCents);
  return totalCents;
}
