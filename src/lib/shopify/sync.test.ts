import { describe, it, expect, vi } from "vitest";

// sync.ts pulls in the live db and Shopify client at import. Stub both — the
// parseUtmParams parser under test touches neither.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("./client", () => ({
  getShopifyClient: vi.fn(),
  toCents: (v: string | null | undefined) =>
    v ? Math.round(parseFloat(v) * 100) : 0,
}));

import { parseUtmParams, sumRefundedCents } from "@/lib/shopify/sync";
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
