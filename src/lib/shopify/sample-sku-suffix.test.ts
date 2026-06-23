import { describe, it, expect } from "vitest";
import {
  planSampleSkuSuffix,
  groupUpdatesByProduct,
  isSampleProduct,
} from "./sample-sku-suffix";
import type { ShopifyProduct, ShopifyVariant } from "@/types/shopify";

let nextVariantId = 1;
const variant = (sku: string, title = "Default Title"): ShopifyVariant => ({
  id: nextVariantId++,
  product_id: 0,
  title,
  sku,
  barcode: null,
  price: "0.00",
  inventory_quantity: 0,
  weight: 0,
  weight_unit: "g",
  option1: null,
  option2: null,
  option3: null,
});

let nextProductId = 1;
const product = (
  title: string,
  variants: ShopifyVariant[],
  status = "active",
): ShopifyProduct => ({
  id: nextProductId++,
  title,
  handle: title.toLowerCase().replace(/\s+/g, "-"),
  vendor: "Fitwell",
  product_type: "Buckle",
  status,
  created_at: "",
  updated_at: "",
  options: [],
  variants,
  images: [],
});

describe("isSampleProduct", () => {
  it("matches a trailing '- SAMPLE'", () => {
    expect(isSampleProduct("Fitwell M1 Black Buckle - SAMPLE")).toBe(true);
    expect(isSampleProduct("Fitwell M1 Black Buckle")).toBe(false);
    expect(isSampleProduct("Sample-grade Buckle")).toBe(false); // not a trailing suffix
  });
});

describe("planSampleSkuSuffix", () => {
  it("renames the SAMPLE-side variant of a colliding SKU", () => {
    const products = [
      product("Fitwell M1 Black Buckle", [variant("FWB001-BL-16")]),
      product("Fitwell M1 Black Buckle - SAMPLE", [variant("FWB001-BL-16")]),
    ];
    const { updates, unresolved } = planSampleSkuSuffix(products);
    expect(unresolved).toEqual([]);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      oldSku: "FWB001-BL-16",
      newSku: "FWB001-BL-16-SAMPLE",
      productTitle: "Fitwell M1 Black Buckle - SAMPLE",
    });
  });

  it("leaves the real (non-sample) twin's SKU untouched", () => {
    const products = [
      product("Fitwell M1 Black Buckle", [variant("FWB001-BL-16")]),
      product("Fitwell M1 Black Buckle - SAMPLE", [variant("FWB001-BL-16")]),
    ];
    const { updates } = planSampleSkuSuffix(products);
    expect(updates.every((u) => u.productTitle.endsWith("- SAMPLE"))).toBe(true);
  });

  it("is idempotent — the already-suffixed Stainless precedent is not re-flagged", () => {
    const products = [
      product("Fitwell M1 Stainless Buckle", [variant("FWB001-SS-16")]),
      product("Fitwell M1 Stainless Buckle - SAMPLE", [variant("FWB001-SS-16-SAMPLE")]),
    ];
    const { updates, unresolved } = planSampleSkuSuffix(products);
    expect(updates).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it("does not flag a SAMPLE product whose SKU is already distinct (no collision)", () => {
    const products = [
      product("Fitwell M1 Black Buckle", [variant("FWB001-BL-16")]),
      product("Fitwell M1 Black Buckle - SAMPLE", [variant("FWB001-BL-16-SAMPLE")]),
    ];
    expect(planSampleSkuSuffix(products).updates).toEqual([]);
  });

  it("flags a collision with no sample side as unresolved (no guess)", () => {
    const products = [
      product("OEM M1 Junkers", [variant("FWOE005-M1-SS-18")]),
      product("OEM M1 1776 Atelier", [variant("FWOE005-M1-SS-18")]),
    ];
    const { updates, unresolved } = planSampleSkuSuffix(products);
    expect(updates).toEqual([]);
    expect(unresolved).toEqual([
      { sku: "FWOE005-M1-SS-18", products: ["OEM M1 Junkers", "OEM M1 1776 Atelier"] },
    ]);
  });

  it("skips archived products", () => {
    const products = [
      product("Fitwell M1 Black Buckle", [variant("FWB001-BL-16")]),
      product("Fitwell M1 Black Buckle - SAMPLE", [variant("FWB001-BL-16")], "archived"),
    ];
    // The sample is archived → no live collision → nothing to rename.
    expect(planSampleSkuSuffix(products).updates).toEqual([]);
  });

  it("handles a multi-size, multi-variant sample product", () => {
    const products = [
      product("Fitwell M4 SS", [variant("FWB004-SS-16"), variant("FWB004-SS-22")]),
      product("Fitwell M4 SS - SAMPLE", [variant("FWB004-SS-16"), variant("FWB004-SS-22")]),
    ];
    const { updates } = planSampleSkuSuffix(products);
    expect(updates.map((u) => u.newSku).sort()).toEqual([
      "FWB004-SS-16-SAMPLE",
      "FWB004-SS-22-SAMPLE",
    ]);
  });
});

describe("groupUpdatesByProduct", () => {
  it("groups variant renames under their product", () => {
    const products = [
      product("Fitwell M4 SS", [variant("FWB004-SS-16"), variant("FWB004-SS-22")]),
      product("Fitwell M4 SS - SAMPLE", [variant("FWB004-SS-16"), variant("FWB004-SS-22")]),
    ];
    const { updates } = planSampleSkuSuffix(products);
    const grouped = groupUpdatesByProduct(updates);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].variants).toHaveLength(2);
    expect(grouped[0].productTitle).toBe("Fitwell M4 SS - SAMPLE");
  });
});
