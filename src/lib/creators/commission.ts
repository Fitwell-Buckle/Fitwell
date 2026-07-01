/**
 * Creator affiliate commission math (creator-outreach-campaign.md Phase 1).
 *
 * Pure + side-effect free so it's exhaustively unit-tested — no DB import here
 * (the queries live in commission-queries.ts). Commission is paid to the
 * CREATOR out of margin, never a customer discount. Owed = attributed net
 * revenue × the creator's rate − what's already been paid. A ~$25 floor (D3)
 * gates when an amount is worth cutting a cheque.
 */

/** Don't cut a payout below this (D3). */
export const PAYOUT_FLOOR_CENTS = 2500; // $25

export interface CommissionResult {
  /** Effective rate applied (0 when the creator has no rate assigned yet). */
  ratePct: number;
  /** Attributed net revenue from this creator's codes (can be 0 or negative). */
  attributedNetRevenueCents: number;
  /** ratePct applied to net revenue, floored at 0 (no negative commission). */
  earnedCents: number;
  /** Sum of recorded payouts. */
  paidCents: number;
  /** max(0, earned − paid). */
  owedCents: number;
  /** owed ≥ the payout floor. */
  payable: boolean;
}

export function computeCommission(params: {
  attributedNetRevenueCents: number;
  commissionRatePct: number | null | undefined;
  paidCents: number;
}): CommissionResult {
  const ratePct = params.commissionRatePct ?? 0;
  const net = params.attributedNetRevenueCents;
  // Floor earned at 0 — a refund-heavy window never produces negative owed.
  const earnedCents = Math.max(0, Math.round((net * ratePct) / 100));
  const paidCents = Math.max(0, params.paidCents);
  const owedCents = Math.max(0, earnedCents - paidCents);
  return {
    ratePct,
    attributedNetRevenueCents: net,
    earnedCents,
    paidCents,
    owedCents,
    payable: owedCents >= PAYOUT_FLOOR_CENTS,
  };
}
