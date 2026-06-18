import { describe, it, expect } from "vitest";
import { findSkuCollisions, type CollisionVariant } from "./sku-collisions";

const v = (
  sku: string,
  title: string,
  shopifyVariantId: string,
  variantTitle: string | null = null,
): CollisionVariant => ({ sku, title, variantTitle, shopifyVariantId });

describe("findSkuCollisions", () => {
  it("flags a SKU assigned to two different products", () => {
    const out = findSkuCollisions([
      v("FWOE005-M1-SS-18", "OEM M1 with Logo Junkers", "1"),
      v("FWOE005-M1-SS-18", "OEM M1 with Logo 1776 Atelier", "2"),
      v("FWB001-SB-16", "Bead Blasted Buckle", "3"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].sku).toBe("FWOE005-M1-SS-18");
    expect(out[0].products.map((p) => p.shopifyVariantId)).toEqual(["1", "2"]);
  });

  it("does NOT flag a real product + its SAMPLE twin (same base product)", () => {
    const out = findSkuCollisions([
      v("FWB001-SB-16", "Bead Blasted Stainless Steel Buckle", "1"),
      v("FWB001-SB-16", "Bead Blasted Stainless Steel Buckle - SAMPLE", "2"),
    ]);
    expect(out).toEqual([]);
  });

  it("returns nothing for a clean catalog", () => {
    expect(findSkuCollisions([v("A", "Alpha", "1"), v("B", "Beta", "2")])).toEqual([]);
  });

  it("ignores empty SKUs and sorts results by SKU", () => {
    const out = findSkuCollisions([
      v("", "No SKU one", "1"),
      v("", "No SKU two", "2"),
      v("ZZZ", "Z product A", "3"),
      v("ZZZ", "Z product B", "4"),
      v("AAA", "A product A", "5"),
      v("AAA", "A product B", "6"),
    ]);
    expect(out.map((c) => c.sku)).toEqual(["AAA", "ZZZ"]);
  });
});
