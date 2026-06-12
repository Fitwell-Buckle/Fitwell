import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getCompanyScope,
  findFirst,
  getCatalogCached,
  getCatalogGroupsCached,
  allowedVariantIds,
  createDraftOrderInvoice,
  recordCompanyOrder,
  snapshotInvoiceDeposit,
  getBillingSettings,
} = vi.hoisted(() => ({
  getCompanyScope: vi.fn(),
  findFirst: vi.fn(),
  getCatalogCached: vi.fn(),
  getCatalogGroupsCached: vi.fn().mockResolvedValue([]),
  allowedVariantIds: vi.fn(() => null), // unrestricted
  createDraftOrderInvoice: vi.fn().mockResolvedValue({
    draftOrderId: "gid://shopify/DraftOrder/9",
    invoiceUrl: "https://pay.example/abc",
  }),
  recordCompanyOrder: vi
    .fn()
    .mockResolvedValue({ id: "inv1", invoiceNumber: "INV-00100" }),
  snapshotInvoiceDeposit: vi.fn().mockResolvedValue(undefined),
  getBillingSettings: vi
    .fn()
    .mockResolvedValue({ instructions: "Bank: Acme\nAccount: 123" }),
}));

vi.mock("@/lib/portal/company-session", () => ({ getCompanyScope }));
vi.mock("@/lib/db", () => ({ db: { query: { company: { findFirst } } } }));
vi.mock("@/lib/schema", () => ({ company: { id: "id" } }));
vi.mock("@/lib/catalog/load", () => ({
  getCatalogCached,
  getCatalogGroupsCached,
  allowedVariantIds,
}));
vi.mock("@/lib/shopify/client", () => ({
  getShopifyClient: () => ({ createDraftOrderInvoice }),
}));
vi.mock("@/lib/invoicing/service", () => ({
  recordCompanyOrder,
  snapshotInvoiceDeposit,
}));
vi.mock("@/lib/invoicing/billing-settings", () => ({ getBillingSettings }));

import { POST } from "./route";

const VARIANT = {
  shopifyProductId: "gid://shopify/Product/1",
  shopifyVariantId: "gid://shopify/ProductVariant/1",
  sku: "FWB-1",
  title: "Buckle",
  variantTitle: null,
  priceCents: 10000,
  sizeMm: 20,
  color: null,
  material: null,
};

function makeReq(body: unknown) {
  return new Request("https://portal.fitwellbuckle.co/api/portal/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function company(overrides: Record<string, unknown> = {}) {
  return {
    id: "co1",
    name: "Acme",
    contactEmail: "buyer@acme.com",
    assignedCollectionIds: null,
    assignedProductIds: null,
    depositPercent: 0,
    allowWirePayment: false,
    priceTier: { discountPercent: 0 },
    customer: { shopifyId: "gid://shopify/Customer/1" },
    ...overrides,
  };
}

const cart = { lineItems: [{ shopifyVariantId: VARIANT.shopifyVariantId, quantity: 2 }] };

beforeEach(() => {
  vi.clearAllMocks();
  getCompanyScope.mockResolvedValue({ companyId: "co1", email: "buyer@acme.com" });
  getCatalogCached.mockResolvedValue([VARIANT]);
  getCatalogGroupsCached.mockResolvedValue([]);
  allowedVariantIds.mockReturnValue(null);
  createDraftOrderInvoice.mockResolvedValue({
    draftOrderId: "gid://shopify/DraftOrder/9",
    invoiceUrl: "https://pay.example/abc",
  });
  recordCompanyOrder.mockResolvedValue({ id: "inv1", invoiceNumber: "INV-00100" });
  getBillingSettings.mockResolvedValue({ instructions: "Bank: Acme\nAccount: 123" });
});

describe("POST /api/portal/checkout — payment method", () => {
  it("defaults to card: redirects to the Shopify pay link", async () => {
    findFirst.mockResolvedValue(company());

    const res = await POST(makeReq(cart));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.paymentMethod).toBe("card");
    expect(body.data.payUrl).toBe("https://pay.example/abc");
    expect(recordCompanyOrder).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: "card" }),
    );
  });

  it("rejects a wire request when the brand isn't wire-enabled", async () => {
    findFirst.mockResolvedValue(company({ allowWirePayment: false }));

    const res = await POST(makeReq({ ...cart, paymentMethod: "wire" }));

    expect(res.status).toBe(400);
    expect(createDraftOrderInvoice).not.toHaveBeenCalled();
    expect(recordCompanyOrder).not.toHaveBeenCalled();
  });

  it("wire-enabled: records a wire order, returns instructions, no card redirect", async () => {
    findFirst.mockResolvedValue(company({ allowWirePayment: true }));

    const res = await POST(makeReq({ ...cart, paymentMethod: "wire" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.paymentMethod).toBe("wire");
    expect(body.data.payUrl).toBeNull();
    expect(body.data.wireInstructions).toContain("Bank: Acme");
    expect(recordCompanyOrder).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: "wire" }),
    );
  });

  it("wire orders never split into a deposit, even when the brand has one", async () => {
    findFirst.mockResolvedValue(company({ allowWirePayment: true, depositPercent: 50 }));

    const res = await POST(makeReq({ ...cart, paymentMethod: "wire" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.deposit).toBeNull();
    expect(snapshotInvoiceDeposit).not.toHaveBeenCalled();
    // The draft order bills the full discounted total (all line items), not a deposit line.
    expect(createDraftOrderInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ variantId: VARIANT.shopifyVariantId, quantity: 2 }),
        ]),
      }),
    );
  });
});
