import { describe, expect, it } from "vitest";
import { mapShopifyOrderToGift } from "./shopify-import";
import type { ShopifyOrder } from "@/types/shopify";

function order(overrides: Partial<ShopifyOrder>): ShopifyOrder {
  return {
    id: 555,
    order_number: 1234,
    name: "#1234",
    email: "x@y.com",
    total_price: "0.00",
    subtotal_price: "0.00",
    total_discounts: "0.00",
    total_tax: "0.00",
    currency: "USD",
    financial_status: "paid",
    fulfillment_status: null,
    discount_codes: [],
    refunds: [],
    processed_at: "2026-06-10T00:00:00Z",
    created_at: "2026-06-10T00:00:00Z",
    updated_at: "2026-06-10T00:00:00Z",
    line_items: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    customer: {} as any,
    source_name: "web",
    landing_site: null,
    referring_site: null,
    note: null,
    note_attributes: [],
    tags: "",
    ...overrides,
  };
}

describe("mapShopifyOrderToGift", () => {
  it("maps line items with cents + ids", () => {
    const g = mapShopifyOrderToGift(
      order({
        line_items: [
          {
            id: 1,
            product_id: 99,
            variant_id: 77,
            title: "Ti Buckle",
            sku: "TI-1",
            quantity: 2,
            price: "49.50",
          } as ShopifyOrder["line_items"][number],
        ],
      }),
    );
    expect(g.shopifyOrderId).toBe("555");
    expect(g.orderName).toBe("#1234");
    expect(g.lineItems).toEqual([
      {
        sku: "TI-1",
        title: "Ti Buckle",
        quantity: 2,
        unitPriceCents: 4950,
        shopifyProductId: "99",
        shopifyVariantId: "77",
      },
    ]);
  });

  it("derives shipped from earliest fulfillment", () => {
    const g = mapShopifyOrderToGift(
      order({
        fulfillments: [
          { id: 2, created_at: "2026-06-12T10:00:00Z" },
          { id: 1, created_at: "2026-06-11T10:00:00Z" },
        ],
      }),
    );
    expect(g.shippedAt?.toISOString()).toBe("2026-06-11T10:00:00.000Z");
    expect(g.deliveredAt).toBeNull();
  });

  it("derives delivered + tracking from fulfillment", () => {
    const g = mapShopifyOrderToGift(
      order({
        fulfillments: [
          {
            id: 1,
            created_at: "2026-06-11T10:00:00Z",
            updated_at: "2026-06-14T09:00:00Z",
            shipment_status: "delivered",
            tracking_number: "1Z999",
            tracking_url: "https://track/1Z999",
          },
        ],
      }),
    );
    expect(g.deliveredAt?.toISOString()).toBe("2026-06-14T09:00:00.000Z");
    expect(g.trackingNumber).toBe("1Z999");
    expect(g.trackingUrl).toBe("https://track/1Z999");
  });

  it("falls back to tracking_numbers[] array form", () => {
    const g = mapShopifyOrderToGift(
      order({
        fulfillments: [
          { id: 1, created_at: "2026-06-11T10:00:00Z", tracking_numbers: ["ABC123"] },
        ],
      }),
    );
    expect(g.trackingNumber).toBe("ABC123");
  });

  it("flags cancelled orders", () => {
    const g = mapShopifyOrderToGift(order({ cancelled_at: "2026-06-13T00:00:00Z" }));
    expect(g.cancelled).toBe(true);
  });

  it("handles no fulfillments / no name gracefully", () => {
    const g = mapShopifyOrderToGift(order({ name: undefined, order_number: 42 }));
    expect(g.orderName).toBe("#42");
    expect(g.shippedAt).toBeNull();
    expect(g.trackingNumber).toBeNull();
  });
});
