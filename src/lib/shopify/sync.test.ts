import { describe, it, expect, vi } from "vitest";

// sync.ts pulls in the live db and Shopify client at import. Stub both. The
// pure parsers under test touch neither; the address-persistence test drives a
// recording mock so we can assert which write path upsertCustomer takes.
const { mockDb } = vi.hoisted(() => {
  // A permissive chainable query-builder stub: every builder method returns the
  // same object, and the terminal `.returning()` resolves to one inserted row.
  const chain = () => {
    const o: Record<string, unknown> = {};
    o.values = vi.fn(() => o);
    o.onConflictDoUpdate = vi.fn(() => o);
    o.returning = vi.fn(async () => [{ id: "cust-1" }]);
    o.where = vi.fn(() => o);
    return o;
  };
  return {
    mockDb: {
      insert: vi.fn(() => chain()),
      delete: vi.fn(() => chain()),
      // neon-http: the supported atomic multi-statement path.
      batch: vi.fn(async (_statements: unknown[]) => [[], []]),
      // neon-http: NOT supported — must never be called (it throws at runtime).
      transaction: vi.fn(async () => {
        throw new Error("db.transaction is unsupported on the neon-http driver");
      }),
    },
  };
});
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("./client", () => ({
  getShopifyClient: vi.fn(),
  toCents: (v: string | null | undefined) =>
    v ? Math.round(parseFloat(v) * 100) : 0,
}));

import {
  parseUtmParams,
  refundLineRows,
  shippingFields,
  sumRefundedCents,
  upsertCustomer,
} from "@/lib/shopify/sync";
import type { ShopifyCustomer } from "@/types/shopify";
import type { ShopifyOrder } from "@/types/shopify";

// Minimal ShopifyOrder factory — only the fields sumRefundedCents reads.
// `total_price` is the clamp ceiling (defaults high so it doesn't interfere).
function orderWithRefunds(
  refunds: ShopifyOrder["refunds"],
  total_price = "100000.00",
): ShopifyOrder {
  return { refunds, total_price } as unknown as ShopifyOrder;
}

describe("parseUtmParams", () => {
  it("returns empty object for a null landing site", () => {
    expect(parseUtmParams(null)).toEqual({});
  });

  it("returns empty object when the path carries no utm params", () => {
    expect(parseUtmParams("/products/micro-adjust-buckle")).toEqual({});
  });

  it("extracts all five utm params from a relative landing site", () => {
    expect(
      parseUtmParams(
        "/?utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_term=buckle&utm_content=ad1",
      ),
    ).toEqual({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "spring",
      utm_term: "buckle",
      utm_content: "ad1",
    });
  });

  it("extracts only the params that are present", () => {
    expect(
      parseUtmParams("/landing?utm_source=newsletter&utm_medium=email"),
    ).toEqual({ utm_source: "newsletter", utm_medium: "email" });
  });

  it("handles an absolute URL landing site", () => {
    expect(
      parseUtmParams("https://fitwellbuckle.co/shop?utm_source=facebook"),
    ).toEqual({ utm_source: "facebook" });
  });

  it("skips empty-valued utm params", () => {
    expect(parseUtmParams("/?utm_source=&utm_medium=cpc")).toEqual({
      utm_medium: "cpc",
    });
  });

  it("returns empty object for an empty string (base URL, no params)", () => {
    expect(parseUtmParams("")).toEqual({});
  });
});

describe("sumRefundedCents", () => {
  it("is 0 when there are no refunds", () => {
    expect(sumRefundedCents(orderWithRefunds([]))).toBe(0);
  });

  it("is 0 when refunds carry no line items or adjustments", () => {
    expect(
      sumRefundedCents(orderWithRefunds([{ id: 1, created_at: "x" }])),
    ).toBe(0);
  });

  it("sums refunded item value (subtotal + tax) across refunds, in cents", () => {
    const cents = sumRefundedCents(
      orderWithRefunds([
        {
          id: 1,
          created_at: "x",
          refund_line_items: [{ subtotal: "10.00", total_tax: "0.80" }],
        },
        {
          id: 2,
          created_at: "y",
          refund_line_items: [{ subtotal: "5.00", total_tax: "0.40" }],
        },
      ]),
    );
    expect(cents).toBe(1620);
  });

  it("includes order adjustments (e.g. refunded shipping) by magnitude", () => {
    const cents = sumRefundedCents(
      orderWithRefunds([
        {
          id: 1,
          created_at: "x",
          refund_line_items: [{ subtotal: "10.00" }],
          order_adjustments: [{ amount: "-5.00", tax_amount: "-0.50" }],
        },
      ]),
    );
    expect(cents).toBe(1550); // 1000 + 500 + 50
  });

  it("clamps to the order total so net sales never goes negative", () => {
    const cents = sumRefundedCents(
      orderWithRefunds(
        [{ id: 1, created_at: "x", refund_line_items: [{ subtotal: "300.00" }] }],
        "132.26",
      ),
    );
    expect(cents).toBe(13226);
  });
});

describe("refundLineRows", () => {
  it("is empty when there are no refunds", () => {
    expect(refundLineRows(orderWithRefunds([]), "ord-1")).toEqual([]);
  });

  it("is empty when a refund carries no line items (e.g. shipping-only)", () => {
    const rows = refundLineRows(
      orderWithRefunds([
        {
          id: 9,
          created_at: "2026-01-02T00:00:00Z",
          order_adjustments: [{ amount: "-7.00" }],
        },
      ]),
      "ord-1",
    );
    expect(rows).toEqual([]);
  });

  it("flattens one row per refunded line with product identity, units, value and date", () => {
    const rows = refundLineRows(
      orderWithRefunds([
        {
          id: 555,
          created_at: "2026-03-04T12:00:00Z",
          refund_line_items: [
            {
              subtotal: "59.00",
              total_tax: "4.72",
              line_item_id: 111,
              quantity: 1,
              line_item: {
                product_id: 22,
                variant_id: 33,
                sku: "M1-RG-18",
                title: "Fitwell M1 Rose Gold Buckle",
                variant_title: "18mm Width / Rose Gold",
              },
            },
          ],
        },
      ]),
      "ord-1",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      orderId: "ord-1",
      shopifyRefundId: "555",
      shopifyLineItemId: "111",
      shopifyProductId: "22",
      shopifyVariantId: "33",
      sku: "M1-RG-18",
      title: "Fitwell M1 Rose Gold Buckle",
      variantTitle: "18mm Width / Rose Gold",
      quantity: 1,
      subtotalCents: 5900,
      taxCents: 472,
    });
    expect(rows[0].refundedAt).toEqual(new Date("2026-03-04T12:00:00Z"));
  });

  it("emits a row per line across multiple refunds and tolerates missing nested product fields", () => {
    const rows = refundLineRows(
      orderWithRefunds([
        {
          id: 1,
          created_at: "2026-03-04T00:00:00Z",
          refund_line_items: [
            { subtotal: "30.00", quantity: 1, line_item_id: 1 },
            { subtotal: "30.00", quantity: 2, line_item_id: 2 },
          ],
        },
        {
          id: 2,
          created_at: "2026-03-10T00:00:00Z",
          refund_line_items: [{ subtotal: "30.00", quantity: 1, line_item_id: 3 }],
        },
      ]),
      "ord-1",
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.quantity)).toEqual([1, 2, 1]);
    // Missing nested line_item → null product fields, still a valid row.
    expect(rows[0].shopifyProductId).toBeNull();
    expect(rows[0].sku).toBeNull();
  });
});

describe("shippingFields", () => {
  it("maps the order shipping_address to shipping_* columns", () => {
    const fields = shippingFields({
      shipping_address: {
        first_name: "A",
        last_name: "B",
        address1: "1 Main",
        address2: null,
        city: "Austin",
        province: "Texas",
        province_code: "TX",
        country: "United States",
        country_code: "US",
        zip: "78701",
        phone: null,
      },
    } as unknown as ShopifyOrder);
    expect(fields).toEqual({
      shippingCity: "Austin",
      shippingProvince: "Texas",
      shippingProvinceCode: "TX",
      shippingCountry: "United States",
      shippingCountryCode: "US",
    });
  });

  it("returns all-null when the order has no shipping address", () => {
    expect(shippingFields({} as unknown as ShopifyOrder)).toEqual({
      shippingCity: null,
      shippingProvince: null,
      shippingProvinceCode: null,
      shippingCountry: null,
      shippingCountryCode: null,
    });
  });
});

describe("upsertCustomer address persistence (neon-http write path)", () => {
  // Regression guard for the silent-no-persist bug: `db` is the neon-http
  // driver, which throws on interactive `db.transaction()`. Because the address
  // sync is wrapped in a best-effort try/catch, a transaction would fail
  // invisibly and addresses would never persist — breaking every ship-to /
  // split-fulfillment picker. The sync must use `db.batch` instead.
  function shopifyCustomerWithAddresses(): ShopifyCustomer {
    return {
      id: 123,
      email: "a@b.com",
      first_name: "A",
      last_name: "B",
      phone: null,
      total_spent: "0",
      orders_count: 0,
      tags: "",
      created_at: "2024-01-01T00:00:00Z",
      default_address: { id: 1, address1: "1 St", default: true },
      addresses: [
        { id: 1, address1: "1 St", default: true },
        { id: 2, address1: "2 Ave" },
      ],
    } as unknown as ShopifyCustomer;
  }

  it("persists addresses via db.batch and never db.transaction", async () => {
    mockDb.batch.mockClear();
    mockDb.transaction.mockClear();

    await upsertCustomer(shopifyCustomerWithAddresses());

    expect(mockDb.batch).toHaveBeenCalledTimes(1);
    // The batch carries exactly two statements: delete-then-insert.
    expect(mockDb.batch.mock.calls[0][0]).toHaveLength(2);
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });
});
