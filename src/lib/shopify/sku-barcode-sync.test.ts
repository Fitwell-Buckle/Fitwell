import { describe, it, expect } from "vitest";
import { planForProduct } from "./sku-barcode-sync";
import type { ShopifyProduct, ShopifyVariant } from "@/types/shopify";

function variant(overrides: Partial<ShopifyVariant>): ShopifyVariant {
  return {
    id: 1,
    product_id: 100,
    title: "Default",
    sku: null,
    barcode: null,
    price: "0.00",
    inventory_quantity: 0,
    weight: 0,
    weight_unit: "g",
    option1: null,
    option2: null,
    option3: null,
    ...overrides,
  };
}

function product(variants: ShopifyVariant[]): ShopifyProduct {
  return {
    id: 100,
    title: "Test product",
    handle: "test",
    vendor: "Fitwell",
    product_type: "Buckle",
    status: "active",
    created_at: "",
    updated_at: "",
    options: [],
    variants,
    images: [],
  };
}

describe("planForProduct", () => {
  it("queues a variant whose sku differs from barcode", () => {
    const plan = planForProduct(
      product([variant({ id: 1, sku: "FW-22-BLK", barcode: null })]),
    );
    expect(plan.updates).toEqual([
      { variantId: 1, sku: "FW-22-BLK", oldBarcode: null },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("skips a variant whose barcode already matches the sku", () => {
    const plan = planForProduct(
      product([variant({ id: 2, sku: "FW-22-BLK", barcode: "FW-22-BLK" })]),
    );
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([
      {
        variantId: 2,
        reason: "already-matches",
        sku: "FW-22-BLK",
        barcode: "FW-22-BLK",
      },
    ]);
  });

  it("skips a variant with no sku (so it never blanks an existing barcode)", () => {
    const plan = planForProduct(
      product([variant({ id: 3, sku: null, barcode: "8901234567890" })]),
    );
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([
      { variantId: 3, reason: "no-sku", sku: null, barcode: "8901234567890" },
    ]);
  });

  it("flags an overwrite when the current barcode is a different value", () => {
    const plan = planForProduct(
      product([variant({ id: 4, sku: "FW-22-BLK", barcode: "8901234567890" })]),
    );
    expect(plan.updates).toEqual([
      { variantId: 4, sku: "FW-22-BLK", oldBarcode: "8901234567890" },
    ]);
  });

  it("trims whitespace from the sku before comparing", () => {
    const plan = planForProduct(
      product([variant({ id: 5, sku: "  FW-22-BLK  ", barcode: "FW-22-BLK" })]),
    );
    expect(plan.updates).toEqual([]);
    expect(plan.skipped[0]?.reason).toBe("already-matches");
  });

  it("treats a whitespace-only sku as empty", () => {
    const plan = planForProduct(
      product([variant({ id: 6, sku: "   ", barcode: "8901234567890" })]),
    );
    expect(plan.updates).toEqual([]);
    expect(plan.skipped[0]?.reason).toBe("no-sku");
  });

  it("handles mixed variants in one product", () => {
    const plan = planForProduct(
      product([
        variant({ id: 1, sku: "FW-22-BLK", barcode: null }),
        variant({ id: 2, sku: "FW-22-BLK", barcode: "FW-22-BLK" }),
        variant({ id: 3, sku: null, barcode: null }),
      ]),
    );
    expect(plan.updates.map((u) => u.variantId)).toEqual([1]);
    expect(plan.skipped.map((s) => s.variantId)).toEqual([2, 3]);
  });
});
