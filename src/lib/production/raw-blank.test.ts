import { describe, it, expect } from "vitest";
import { usesRawBlankSummary, summarizeRawBlanks } from "./raw-blank";
import type { ProductionStage } from "./stages";

describe("usesRawBlankSummary", () => {
  it("true when the supplier owns only pre-polishing stages", () => {
    expect(usesRawBlankSummary(["stamping"])).toBe(true);
    expect(usesRawBlankSummary(["stamping", "edm"])).toBe(true);
    expect(usesRawBlankSummary(["supplier_po", "stamping"])).toBe(true);
  });
  it("false once polishing or later is owned (finish matters)", () => {
    expect(usesRawBlankSummary(["stamping", "polishing"])).toBe(false);
    expect(usesRawBlankSummary(["plating"])).toBe(false);
    expect(usesRawBlankSummary(["packaging"])).toBe(false);
  });
  it("false for no stages", () => {
    expect(usesRawBlankSummary([])).toBe(false);
  });
});

describe("summarizeRawBlanks", () => {
  it("merges colours of the same size + material (the gold/black example)", () => {
    const groups = summarizeRawBlanks([
      { sku: "FBW-SS-16-GLD", quantity: 100, sizeMm: 16, material: "Steel" },
      { sku: "FBW-SS-16-BLK", quantity: 100, sizeMm: 16, material: "Steel" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      label: "16mm Steel",
      quantity: 200,
      sizeMm: 16,
      material: "Steel",
    });
    expect(groups[0].skus).toEqual(["FBW-SS-16-GLD", "FBW-SS-16-BLK"]);
  });

  it("keeps different sizes/materials separate and sorts by size", () => {
    const groups = summarizeRawBlanks([
      { sku: "A", quantity: 5, sizeMm: 20, material: "Steel" },
      { sku: "B", quantity: 3, sizeMm: 16, material: "Steel" },
      { sku: "C", quantity: 2, sizeMm: 16, material: "Titanium" },
    ]);
    expect(groups.map((g) => g.label)).toEqual(["16mm Steel", "16mm Titanium", "20mm Steel"]);
  });

  it("leaves items with unknown size/material on their own (no wrong merge)", () => {
    const stages: ProductionStage[] = ["stamping"];
    expect(usesRawBlankSummary(stages)).toBe(true); // sanity
    const groups = summarizeRawBlanks([
      { sku: "X", quantity: 4, sizeMm: null, material: "Steel" },
      { sku: "Y", quantity: 6, sizeMm: 16, material: null },
      { sku: "Z", quantity: 1, sizeMm: 16, material: "Steel" },
    ]);
    // X and Y can't be grouped → own rows; Z groups on its own.
    expect(groups).toHaveLength(3);
    expect(groups.find((g) => g.label === "X")?.quantity).toBe(4);
    expect(groups.find((g) => g.label === "16mm Steel")?.quantity).toBe(1);
  });
});
