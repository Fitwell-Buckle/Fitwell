import { describe, expect, it } from "vitest";
import { computeWeightedAvgCost, type CostLine } from "./compute";

describe("computeWeightedAvgCost", () => {
  it("quantity-weights across multiple PO lines for one SKU", () => {
    // 100 @ 300c and 300 @ 310c → (100*300 + 300*310) / 400 = 307.5
    const lines: CostLine[] = [
      { sku: "FWB001-SS-16", quantity: 100, unitCostCents: 300 },
      { sku: "FWB001-SS-16", quantity: 300, unitCostCents: 310 },
    ];
    const out = computeWeightedAvgCost(lines);
    const c = out.get("FWB001-SS-16")!;
    expect(c.avgUnitCostCents).toBeCloseTo(307.5, 5);
    expect(c.unitsCosted).toBe(400);
    expect(c.lineCount).toBe(2);
  });

  it("keeps SKUs independent", () => {
    const out = computeWeightedAvgCost([
      { sku: "A", quantity: 10, unitCostCents: 500 },
      { sku: "B", quantity: 10, unitCostCents: 900 },
    ]);
    expect(out.get("A")!.avgUnitCostCents).toBe(500);
    expect(out.get("B")!.avgUnitCostCents).toBe(900);
  });

  it("ignores lines with null cost (no zero-drag) and non-positive qty", () => {
    const out = computeWeightedAvgCost([
      { sku: "A", quantity: 50, unitCostCents: 400 },
      { sku: "A", quantity: 50, unitCostCents: null }, // unknown cost — skip
      { sku: "A", quantity: 0, unitCostCents: 400 }, // zero qty — skip
      { sku: "A", quantity: -5, unitCostCents: 400 }, // negative — skip
    ]);
    const c = out.get("A")!;
    expect(c.avgUnitCostCents).toBe(400);
    expect(c.unitsCosted).toBe(50);
    expect(c.lineCount).toBe(1);
  });

  it("omits a SKU entirely when no line carries a cost", () => {
    const out = computeWeightedAvgCost([
      { sku: "A", quantity: 50, unitCostCents: null },
    ]);
    expect(out.has("A")).toBe(false);
  });
});
