import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ltv.ts loads the live Neon db at import; stub it and drive findFirst.
vi.mock("@/lib/db", () => ({
  db: { query: { customer: { findFirst: vi.fn() } } },
}));

import { db } from "@/lib/db";
import { calculateCustomerLTV } from "@/lib/analytics/ltv";

const findFirst = vi.mocked(db.query.customer.findFirst);

const NOW = new Date("2026-05-18T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  findFirst.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("calculateCustomerLTV", () => {
  it("returns null when the customer does not exist", async () => {
    findFirst.mockResolvedValue(undefined);
    expect(await calculateCustomerLTV("missing")).toBeNull();
  });

  it("computes AOV and annualized projection from spend and tenure", async () => {
    findFirst.mockResolvedValue({
      totalSpent: 10_000, // $100.00 in cents
      orderCount: 4,
      firstOrderAt: daysAgo(100),
    } as never);

    const ltv = await calculateCustomerLTV("c1");

    expect(ltv).toEqual({
      customerId: "c1",
      totalSpent: 10_000,
      orderCount: 4,
      avgOrderValue: 2_500, // 10000 / 4
      daysSinceFirstOrder: 100,
      predictedAnnualValue: 36_500, // round(10000 / 100 * 365)
    });
  });

  it("rounds a fractional average order value", async () => {
    findFirst.mockResolvedValue({
      totalSpent: 10_000,
      orderCount: 3,
      firstOrderAt: daysAgo(30),
    } as never);

    const ltv = await calculateCustomerLTV("c2");
    expect(ltv?.avgOrderValue).toBe(3_333); // round(10000 / 3)
  });

  it("treats null totalSpent/orderCount as zero and avoids divide-by-zero", async () => {
    findFirst.mockResolvedValue({
      totalSpent: null,
      orderCount: null,
      firstOrderAt: null,
    } as never);

    expect(await calculateCustomerLTV("c3")).toEqual({
      customerId: "c3",
      totalSpent: 0,
      orderCount: 0,
      avgOrderValue: 0,
      daysSinceFirstOrder: 0,
      predictedAnnualValue: 0,
    });
  });

  it("guards AOV when orderCount is 0 but spend is non-zero", async () => {
    findFirst.mockResolvedValue({
      totalSpent: 5_000,
      orderCount: 0,
      firstOrderAt: daysAgo(10),
    } as never);

    const ltv = await calculateCustomerLTV("c4");
    expect(ltv?.avgOrderValue).toBe(0);
  });

  it("floors tenure to a minimum of 1 day for a same-day first order", async () => {
    findFirst.mockResolvedValue({
      totalSpent: 5_000,
      orderCount: 1,
      firstOrderAt: NOW, // ordered "just now"
    } as never);

    const ltv = await calculateCustomerLTV("c5");
    expect(ltv?.daysSinceFirstOrder).toBe(1);
    expect(ltv?.predictedAnnualValue).toBe(1_825_000); // round(5000 / 1 * 365)
  });
});
