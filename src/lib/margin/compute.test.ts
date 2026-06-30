import { describe, it, expect } from "vitest";
import {
  rollUpMarginByChannel,
  type MarginOrderInput,
} from "./compute";

// Helper: a per-order economics row with sensible defaults.
const o = (over: Partial<MarginOrderInput>): MarginOrderInput => ({
  channel: "d2c",
  revenueCents: 0,
  cogsCents: 0,
  costed: true,
  shippingCents: 0,
  refundCents: 0,
  ...over,
});

describe("rollUpMarginByChannel", () => {
  it("sums contribution = revenue − cogs − shipping − refunds per channel", () => {
    const rows = rollUpMarginByChannel({
      orders: [
        o({ channel: "d2c", revenueCents: 10000, cogsCents: 2000, shippingCents: 600, refundCents: 0 }),
        o({ channel: "d2c", revenueCents: 5000, cogsCents: 1000, shippingCents: 600, refundCents: 500 }),
        o({ channel: "b2b", revenueCents: 40000, cogsCents: 10000, shippingCents: 2000, refundCents: 0 }),
      ],
    });
    const d2c = rows.find((r) => r.channel === "d2c")!;
    const b2b = rows.find((r) => r.channel === "b2b")!;

    expect(d2c.orders).toBe(2);
    expect(d2c.revenueCents).toBe(15000);
    expect(d2c.cogsCents).toBe(3000);
    expect(d2c.shippingCostCents).toBe(1200);
    expect(d2c.refundsCents).toBe(500);
    expect(d2c.contributionCents).toBe(15000 - 3000 - 1200 - 500); // 10300
    expect(d2c.marginPct).toBeCloseTo((10300 / 15000) * 100, 5);
    expect(b2b.contributionCents).toBe(40000 - 10000 - 2000); // 28000
  });

  it("splits costed vs uncosted revenue by the order's costed flag", () => {
    const rows = rollUpMarginByChannel({
      orders: [
        o({ channel: "b2b", revenueCents: 9600, cogsCents: 4800, costed: true }),
        o({ channel: "b2b", revenueCents: 400, cogsCents: 0, costed: false }), // custom-money order
      ],
    });
    const b2b = rows[0];
    expect(b2b.revenueCents).toBe(10000);
    expect(b2b.costedRevenueCents).toBe(9600);
    expect(b2b.uncostedRevenueCents).toBe(400);
    expect(b2b.marginPct).not.toBeNull(); // 96% coverage ≥ threshold
  });

  it("withholds margin% below the coverage threshold", () => {
    const rows = rollUpMarginByChannel({
      orders: [
        o({ channel: "b2b", revenueCents: 8500, cogsCents: 4250, costed: true }),
        o({ channel: "b2b", revenueCents: 1500, cogsCents: 0, costed: false }), // 85% coverage
      ],
    });
    expect(rows[0].marginPct).toBeNull();
  });

  it("with no costed orders, margin% is null (current B2B custom-money case)", () => {
    const rows = rollUpMarginByChannel({
      orders: [
        o({ channel: "b2b", revenueCents: 19570, cogsCents: 0, costed: false, refundCents: 0 }),
      ],
    });
    expect(rows[0].costedRevenueCents).toBe(0);
    expect(rows[0].marginPct).toBeNull();
  });

  it("returns channels in canonical order, omitting empty ones", () => {
    const rows = rollUpMarginByChannel({
      orders: [
        o({ channel: "b2b", revenueCents: 100 }),
        o({ channel: "d2c", revenueCents: 100 }),
      ],
    });
    expect(rows.map((r) => r.channel)).toEqual(["d2c", "b2b"]);
  });

  it("once costed, a lower B2B selling price yields a LOWER margin% than D2C", () => {
    // Same unit cost (2000); retail 5000 vs wholesale 2500. Revenue is the NET
    // figure the loader passes (subtotal), so wholesale shows its true price.
    const rows = rollUpMarginByChannel({
      orders: [
        o({ channel: "d2c", revenueCents: 5000, cogsCents: 2000 }),
        o({ channel: "b2b", revenueCents: 2500, cogsCents: 2000 }),
      ],
    });
    const d2c = rows.find((r) => r.channel === "d2c")!;
    const b2b = rows.find((r) => r.channel === "b2b")!;
    expect(d2c.marginPct).toBeCloseTo(60, 5); // (5000-2000)/5000
    expect(b2b.marginPct).toBeCloseTo(20, 5); // (2500-2000)/2500
    expect(d2c.marginPct!).toBeGreaterThan(b2b.marginPct!);
  });
});
