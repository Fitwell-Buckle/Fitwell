import { describe, expect, it } from "vitest";
import { computeCogsRows, type SkuSales, type SkuCost } from "./compute";

function cost(sku: string, avgUnitCostCents: number): [string, SkuCost] {
  return [sku, { sku, avgUnitCostCents, unitsCosted: 1, lineCount: 1 }];
}

describe("computeCogsRows", () => {
  it("computes per-SKU COGS, gross margin and margin %", () => {
    const sales: SkuSales[] = [
      { sku: "A", title: "Stainless 16mm", unitsSold: 100, revenueCents: 400_00 },
    ];
    const costs = new Map([cost("A", 310)]); // $3.10/unit
    const { rows } = computeCogsRows(sales, costs);
    const r = rows[0];
    expect(r.avgUnitCostCents).toBe(310);
    expect(r.cogsCents).toBe(310 * 100); // 31000
    expect(r.grossMarginCents).toBe(400_00 - 310 * 100); // 9000
    expect(r.marginPct).toBeCloseTo(22.5, 5);
  });

  it("rounds fractional average cost when valuing sold units", () => {
    const sales: SkuSales[] = [
      { sku: "A", title: "A", unitsSold: 3, revenueCents: 10_00 },
    ];
    const costs = new Map([cost("A", 307.5)]);
    const { rows } = computeCogsRows(sales, costs);
    // round(307.5 * 3) = round(922.5) = 923
    expect(rows[0].cogsCents).toBe(923);
  });

  it("flags uncosted SKUs and excludes them from totals", () => {
    const sales: SkuSales[] = [
      { sku: "A", title: "A", unitsSold: 10, revenueCents: 80_00 },
      { sku: "M3-LE", title: "Limited", unitsSold: 5, revenueCents: 25_00 },
    ];
    const costs = new Map([cost("A", 400)]);
    const { rows, totals, uncosted } = computeCogsRows(sales, costs);

    expect(uncosted.map((u) => u.sku)).toEqual(["M3-LE"]);
    const m3 = rows.find((r) => r.sku === "M3-LE")!;
    expect(m3.cogsCents).toBeNull();
    expect(m3.marginPct).toBeNull();

    // Totals: revenue counts everything; cogs/margin only the costed SKU.
    expect(totals.revenueCents).toBe(105_00); // 80.00 + 25.00
    expect(totals.costedRevenueCents).toBe(80_00);
    expect(totals.cogsCents).toBe(400 * 10); // 4000 = $40.00
    expect(totals.grossMarginCents).toBe(80_00 - 4000); // $40.00
    expect(totals.marginPct).toBeCloseTo(50, 5); // 4000 / 8000
  });

  it("sorts rows by COGS descending", () => {
    const sales: SkuSales[] = [
      { sku: "small", title: "s", unitsSold: 1, revenueCents: 40_00 },
      { sku: "big", title: "b", unitsSold: 100, revenueCents: 400_00 },
    ];
    const costs = new Map([cost("small", 300), cost("big", 300)]);
    const { rows } = computeCogsRows(sales, costs);
    expect(rows[0].sku).toBe("big");
  });
});
