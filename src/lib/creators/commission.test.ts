import { describe, expect, it } from "vitest";
import { computeCommission, PAYOUT_FLOOR_CENTS } from "./commission";

describe("computeCommission", () => {
  it("applies the rate to net revenue", () => {
    // $100.00 net × 15% = $15.00 earned
    const r = computeCommission({
      attributedNetRevenueCents: 10000,
      commissionRatePct: 15,
      paidCents: 0,
    });
    expect(r.earnedCents).toBe(1500);
    expect(r.owedCents).toBe(1500);
    expect(r.ratePct).toBe(15);
  });

  it("marks owed ≥ floor as payable and below as not", () => {
    // $200 × 20% = $40 owed → payable
    const big = computeCommission({
      attributedNetRevenueCents: 20000,
      commissionRatePct: 20,
      paidCents: 0,
    });
    expect(big.owedCents).toBe(4000);
    expect(big.payable).toBe(true);

    // $100 × 15% = $15 owed → below the $25 floor
    const small = computeCommission({
      attributedNetRevenueCents: 10000,
      commissionRatePct: 15,
      paidCents: 0,
    });
    expect(small.owedCents).toBe(1500);
    expect(small.payable).toBe(false);
  });

  it("treats exactly the floor as payable", () => {
    // net such that earned == PAYOUT_FLOOR_CENTS ($25 at 10% needs $250 net)
    const r = computeCommission({
      attributedNetRevenueCents: 25000,
      commissionRatePct: 10,
      paidCents: 0,
    });
    expect(r.earnedCents).toBe(PAYOUT_FLOOR_CENTS);
    expect(r.payable).toBe(true);
  });

  it("subtracts recorded payouts from owed", () => {
    const r = computeCommission({
      attributedNetRevenueCents: 20000, // $40 earned at 20%
      commissionRatePct: 20,
      paidCents: 3000, // $30 already paid
    });
    expect(r.earnedCents).toBe(4000);
    expect(r.paidCents).toBe(3000);
    expect(r.owedCents).toBe(1000);
  });

  it("never returns negative owed when over-paid", () => {
    const r = computeCommission({
      attributedNetRevenueCents: 10000, // $15 earned
      commissionRatePct: 15,
      paidCents: 5000, // paid more than earned
    });
    expect(r.owedCents).toBe(0);
    expect(r.payable).toBe(false);
  });

  it("floors earned at 0 when net revenue is negative (refunds > sales)", () => {
    const r = computeCommission({
      attributedNetRevenueCents: -5000,
      commissionRatePct: 20,
      paidCents: 0,
    });
    expect(r.earnedCents).toBe(0);
    expect(r.owedCents).toBe(0);
  });

  it("yields zero commission when no rate is assigned", () => {
    for (const rate of [null, undefined]) {
      const r = computeCommission({
        attributedNetRevenueCents: 50000,
        commissionRatePct: rate,
        paidCents: 0,
      });
      expect(r.ratePct).toBe(0);
      expect(r.earnedCents).toBe(0);
      expect(r.owedCents).toBe(0);
    }
  });

  it("rounds to the nearest cent", () => {
    // $3.33 net × 15% = 49.95¢ → 50¢
    const r = computeCommission({
      attributedNetRevenueCents: 333,
      commissionRatePct: 15,
      paidCents: 0,
    });
    expect(r.earnedCents).toBe(50);
  });

  it("guards against negative recorded payouts", () => {
    const r = computeCommission({
      attributedNetRevenueCents: 10000,
      commissionRatePct: 15,
      paidCents: -100,
    });
    expect(r.paidCents).toBe(0);
    expect(r.owedCents).toBe(1500);
  });
});
