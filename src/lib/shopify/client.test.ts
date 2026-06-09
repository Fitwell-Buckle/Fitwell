import { describe, it, expect } from "vitest";
import {
  toCents,
  buildDraftOrderInput,
  type DraftOrderInvoiceParams,
} from "@/lib/shopify/client";

describe("toCents", () => {
  it("converts a Shopify decimal string to integer cents", () => {
    expect(toCents("49.95")).toBe(4995);
    expect(toCents("100")).toBe(10000);
    expect(toCents("12.3")).toBe(1230);
  });

  it("handles negative amounts (refunds/adjustments)", () => {
    expect(toCents("-5.50")).toBe(-550);
  });

  it("returns 0 for null, undefined, or empty input", () => {
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
    expect(toCents("")).toBe(0);
  });

  it("returns 0 for non-numeric input", () => {
    expect(toCents("abc")).toBe(0);
  });
});

describe("buildDraftOrderInput", () => {
  // A minimal sample-shaped payload: one real variant, 100% off, tagged.
  function sampleParams(
    over: Partial<DraftOrderInvoiceParams> = {},
  ): DraftOrderInvoiceParams {
    return {
      email: "buyer@watchshop.example",
      discountPercent: 100,
      discountTitle: "Sample",
      tags: ["sample"],
      lines: [
        {
          variantId: "gid://shopify/ProductVariant/123",
          title: "Micro-Adjust Buckle 20mm",
          quantity: 1,
          unitPriceCents: 4995,
        },
      ],
      ...over,
    };
  }

  it("maps a variant line to a variantId GID, stripping to the numeric id", () => {
    const input = buildDraftOrderInput(sampleParams());
    expect(input.lineItems).toEqual([
      { variantId: "gid://shopify/ProductVariant/123", quantity: 1 },
    ]);
  });

  it("accepts a bare numeric variant id and normalizes it to a GID", () => {
    const input = buildDraftOrderInput(
      sampleParams({
        lines: [
          {
            variantId: "456",
            title: "x",
            quantity: 2,
            unitPriceCents: 100,
          },
        ],
      }),
    );
    expect(input.lineItems).toEqual([
      { variantId: "gid://shopify/ProductVariant/456", quantity: 2 },
    ]);
  });

  it("falls back to a custom-price line when there is no variant", () => {
    const input = buildDraftOrderInput(
      sampleParams({
        lines: [
          {
            variantId: null,
            title: "Custom engraved buckle",
            quantity: 3,
            unitPriceCents: 1250,
          },
        ],
      }),
    );
    expect(input.lineItems).toEqual([
      { title: "Custom engraved buckle", originalUnitPrice: "12.50", quantity: 3 },
    ]);
  });

  it("includes tags when present", () => {
    const input = buildDraftOrderInput(sampleParams({ tags: ["sample", "press"] }));
    expect(input.tags).toEqual(["sample", "press"]);
  });

  it("omits tags when absent or empty", () => {
    expect(buildDraftOrderInput(sampleParams({ tags: undefined })).tags).toBeUndefined();
    expect(buildDraftOrderInput(sampleParams({ tags: [] })).tags).toBeUndefined();
  });

  it("applies a 100% discount with the given title for samples", () => {
    const input = buildDraftOrderInput(sampleParams());
    expect(input.appliedDiscount).toEqual({
      valueType: "PERCENTAGE",
      value: 100,
      title: "Sample",
    });
  });

  it("defaults the discount title to the B2B tier when none is given", () => {
    const input = buildDraftOrderInput(
      sampleParams({ discountTitle: undefined, discountPercent: 30 }),
    );
    expect(input.appliedDiscount).toMatchObject({ title: "B2B price tier", value: 30 });
  });

  it("omits the discount entirely when discountPercent is 0", () => {
    const input = buildDraftOrderInput(sampleParams({ discountPercent: 0 }));
    expect(input.appliedDiscount).toBeUndefined();
  });

  it("includes a cleaned shipping address (camelCase, null/empty dropped)", () => {
    const input = buildDraftOrderInput(
      sampleParams({
        shippingAddress: {
          firstName: "Dana",
          lastName: "Vega",
          company: "Vega Watch Co.",
          address1: "12 Market St",
          address2: null,
          city: "Portland",
          province: "OR",
          country: "United States",
          zip: "97201",
          phone: "",
        },
      }),
    );
    expect(input.shippingAddress).toEqual({
      firstName: "Dana",
      lastName: "Vega",
      company: "Vega Watch Co.",
      address1: "12 Market St",
      city: "Portland",
      province: "OR",
      country: "United States",
      zip: "97201",
    });
  });

  it("omits the shipping address when not provided", () => {
    expect(buildDraftOrderInput(sampleParams()).shippingAddress).toBeUndefined();
  });

  it("sets purchasingEntity from a Shopify customer id when present", () => {
    const input = buildDraftOrderInput(
      sampleParams({ shopifyCustomerId: "gid://shopify/Customer/789" }),
    );
    expect(input.purchasingEntity).toEqual({
      customerId: "gid://shopify/Customer/789",
    });
  });

  it("includes email and note only when set", () => {
    const withNote = buildDraftOrderInput(sampleParams({ note: "WindUp booth follow-up" }));
    expect(withNote.email).toBe("buyer@watchshop.example");
    expect(withNote.note).toBe("WindUp booth follow-up");

    const noEmail = buildDraftOrderInput(sampleParams({ email: null }));
    expect(noEmail.email).toBeUndefined();
    expect(noEmail.note).toBeUndefined();
  });
});
