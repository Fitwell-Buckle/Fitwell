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
function orderWithRefunds(refunds: ShopifyOrder["refunds"]): ShopifyOrder {
  return { refunds } as unknown as ShopifyOrder;
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

  it("is 0 when refunds exist but carry no transactions", () => {
    expect(
      sumRefundedCents(orderWithRefunds([{ id: 1, created_at: "x" }])),
    ).toBe(0);
  });

  it("sums successful refund transactions across multiple refunds (in cents)", () => {
    const cents = sumRefundedCents(
      orderWithRefunds([
        {
          id: 1,
          created_at: "x",
          transactions: [{ amount: "10.00", kind: "refund", status: "success" }],
        },
        {
          id: 2,
          created_at: "y",
          transactions: [{ amount: "5.50", kind: "refund", status: "success" }],
        },
      ]),
    );
    expect(cents).toBe(1550);
  });

  it("ignores non-refund kinds and non-success statuses", () => {
    const cents = sumRefundedCents(
      orderWithRefunds([
        {
          id: 1,
          created_at: "x",
          transactions: [
            { amount: "10.00", kind: "refund", status: "success" }, // counts
            { amount: "99.00", kind: "sale", status: "success" }, // wrong kind
            { amount: "99.00", kind: "refund", status: "pending" }, // not success
          ],
        },
      ]),
    );
    expect(cents).toBe(1000);
  });
});
