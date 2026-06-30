import { describe, it, expect } from "vitest";
import { rollUpMarginByChannel, type MarginRollupInputs } from "./compute";

describe("rollUpMarginByChannel", () => {
  it("computes contribution = revenue - cogs - shipping - refunds per channel", () => {
    const inputs: MarginRollupInputs = {
      orders: [
        { id: "o1", channel: "d2c", refundCents: 0 },
        { id: "o2", channel: "d2c", refundCents: 500 },
        { id: "o3", channel: "b2b", refundCents: 0 },
      ],
      lineItems: [
        { orderId: "o1", sku: "A", quantity: 2, priceCents: 5000 }, // rev 10000, cost 2×1000=2000
        { orderId: "o2", sku: "A", quantity: 1, priceCents: 5000 }, // rev 5000, cost 1000
        { orderId: "o3", sku: "A", quantity: 10, priceCents: 4000 }, // rev 40000, cost 10000
      ],
      shippingByOrder: new Map([
        ["o1", 600],
        ["o2", 600],
        ["o3", 2000],
      ]),
      costBySku: new Map([["A", 1000]]),
    };

    const rows = rollUpMarginByChannel(inputs);
    const d2c = rows.find((r) => r.channel === "d2c")!;
    const b2b = rows.find((r) => r.channel === "b2b")!;

    // D2C: revenue 15000, cogs 3000, shipping 1200, refunds 500
    expect(d2c.orders).toBe(2);
    expect(d2c.revenueCents).toBe(15000);
    expect(d2c.cogsCents).toBe(3000);
    expect(d2c.shippingCostCents).toBe(1200);
    expect(d2c.refundsCents).toBe(500);
    expect(d2c.contributionCents).toBe(15000 - 3000 - 1200 - 500); // 10300
    expect(d2c.marginPct).toBeCloseTo((10300 / 15000) * 100, 5);

    // B2B: revenue 40000, cogs 10000, shipping 2000, refunds 0
    expect(b2b.contributionCents).toBe(40000 - 10000 - 2000 - 0); // 28000
  });

  it("tracks uncosted revenue separately and excludes it from COGS", () => {
    const rows = rollUpMarginByChannel({
      orders: [{ id: "o1", channel: "d2c", refundCents: 0 }],
      lineItems: [
        { orderId: "o1", sku: "COSTED", quantity: 1, priceCents: 3000 },
        { orderId: "o1", sku: "NOCOST", quantity: 1, priceCents: 2000 },
        { orderId: "o1", sku: null, quantity: 1, priceCents: 1000 }, // null sku → uncosted
      ],
      shippingByOrder: new Map(),
      costBySku: new Map([["COSTED", 1200]]),
    });
    const d2c = rows[0];
    expect(d2c.revenueCents).toBe(6000);
    expect(d2c.cogsCents).toBe(1200); // only the COSTED line
    expect(d2c.uncostedRevenueCents).toBe(3000); // NOCOST + null sku
  });

  it("returns channels in canonical order, omitting empty ones", () => {
    const rows = rollUpMarginByChannel({
      orders: [
        { id: "b", channel: "b2b", refundCents: 0 },
        { id: "d", channel: "d2c", refundCents: 0 },
      ],
      lineItems: [],
      shippingByOrder: new Map(),
      costBySku: new Map(),
    });
    expect(rows.map((r) => r.channel)).toEqual(["d2c", "b2b"]); // d2c before b2b, no tradeshow/sample
  });

  it("marginPct is null when a channel has zero revenue", () => {
    const rows = rollUpMarginByChannel({
      orders: [{ id: "o1", channel: "d2c", refundCents: 0 }],
      lineItems: [],
      shippingByOrder: new Map([["o1", 500]]),
      costBySku: new Map(),
    });
    expect(rows[0].revenueCents).toBe(0);
    expect(rows[0].marginPct).toBeNull();
    expect(rows[0].contributionCents).toBe(-500); // shipping with no revenue → negative
  });
});
