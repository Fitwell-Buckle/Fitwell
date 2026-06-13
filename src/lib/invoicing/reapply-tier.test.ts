import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  companyFindFirst,
  invoiceFindMany,
  dbSet,
  dbUpdate,
  createDraftOrderInvoice,
  deleteDraftOrder,
} = vi.hoisted(() => {
  const dbSet = vi.fn((_vals: Record<string, unknown>) => ({
    where: () => Promise.resolve(undefined),
  }));
  return {
    companyFindFirst: vi.fn(),
    invoiceFindMany: vi.fn(),
    dbSet,
    dbUpdate: vi.fn(() => ({ set: dbSet })),
    createDraftOrderInvoice: vi.fn(),
    deleteDraftOrder: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      company: { findFirst: companyFindFirst },
      invoice: { findMany: invoiceFindMany },
    },
    update: dbUpdate,
  },
}));
vi.mock("@/lib/schema", () => ({
  invoice: {
    id: {},
    status: {},
    companyId: {},
    paidAt: {},
    depositPaidAt: {},
    balancePaidAt: {},
  },
  company: { id: {} },
  invoiceLineItem: {},
  invoiceAttachment: {},
  customerAddress: {},
  productionPo: {},
}));
vi.mock("@/lib/shopify/client", () => ({
  getShopifyClient: () => ({ createDraftOrderInvoice, deleteDraftOrder }),
}));
vi.mock("@/lib/production/service", () => ({ createPo: vi.fn(), createMultiSupplierPo: vi.fn() }));
// computeInvoiceTotals / computeDeposit kept real (pure money math).

import { reapplyTierToOpenInvoices } from "./service";

// 2 × $40 line; at 50% off the order total is $40.00 (4000¢).
const LINE = { shopifyVariantId: "gid://shopify/ProductVariant/1", title: "Buckle", quantity: 2, unitPriceCents: 4000 };

function comp(over: Record<string, unknown> = {}) {
  return {
    id: "co1",
    name: "Acme",
    contactEmail: "a@acme.com",
    priceTier: { discountPercent: 50 },
    customer: { shopifyId: "gid://shopify/Customer/1" },
    ...over,
  };
}
const draft = { id: "d1", invoiceNumber: "INV-1", status: "draft", depositPercent: null, shopifyDraftOrderId: null, lineItems: [LINE] };
const sent = { id: "s1", invoiceNumber: "INV-2", status: "sent", depositPercent: null, shopifyDraftOrderId: "gid://shopify/DraftOrder/old", lineItems: [LINE] };
const sentDeposit = { id: "s2", invoiceNumber: "INV-3", status: "sent", depositPercent: 50, shopifyDraftOrderId: "gid://shopify/DraftOrder/old2", lineItems: [LINE] };

beforeEach(() => {
  vi.clearAllMocks();
  companyFindFirst.mockResolvedValue(comp());
  createDraftOrderInvoice.mockResolvedValue({
    draftOrderId: "gid://shopify/DraftOrder/new",
    invoiceUrl: "https://pay.example/new",
  });
});

describe("reapplyTierToOpenInvoices", () => {
  it("does nothing for an unknown company", async () => {
    companyFindFirst.mockResolvedValue(undefined);
    const r = await reapplyTierToOpenInvoices("nope");
    expect(r).toEqual({ repriced: 0, regenerated: 0, shopifyFailures: 0 });
    expect(invoiceFindMany).not.toHaveBeenCalled();
  });

  it("re-prices drafts (no Shopify) and regenerates sent invoices' pay links", async () => {
    invoiceFindMany.mockResolvedValue([draft, sent, sentDeposit]);
    const r = await reapplyTierToOpenInvoices("co1");

    expect(r.repriced).toBe(3);
    expect(r.regenerated).toBe(2); // both sent invoices
    expect(r.shopifyFailures).toBe(0);

    // Only the two sent invoices hit Shopify; the draft has no pay link.
    expect(createDraftOrderInvoice).toHaveBeenCalledTimes(2);
    // Stale draft orders are deleted on regeneration.
    expect(deleteDraftOrder).toHaveBeenCalledWith("gid://shopify/DraftOrder/old");
    expect(deleteDraftOrder).toHaveBeenCalledWith("gid://shopify/DraftOrder/old2");

    // Every invoice's row is re-priced to 50% off (total 4000¢).
    const repriceWrites = dbSet.mock.calls
      .map((c) => c[0])
      .filter((v) => v.discountPercent === 50);
    expect(repriceWrites.length).toBe(3);
    expect(repriceWrites.every((v) => v.totalCents === 4000)).toBe(true);
  });

  it("recomputes the deposit AMOUNT off the new total", async () => {
    invoiceFindMany.mockResolvedValue([sentDeposit]);
    await reapplyTierToOpenInvoices("co1");

    // Deposit invoice → bills a 50% deposit of the new $40 total = $20 (2000¢),
    // as a custom deposit line with the order-level discount zeroed.
    expect(createDraftOrderInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        discountPercent: 0,
        lines: [expect.objectContaining({ variantId: null, quantity: 1, unitPriceCents: 2000 })],
      }),
    );
    // The invoice row's depositCents is updated to the recomputed amount.
    const depositWrite = dbSet.mock.calls.map((c) => c[0]).find((v) => "depositCents" in v);
    expect(depositWrite?.depositCents).toBe(2000);
  });

  it("re-prices sent invoices but skips Shopify for non-Shopify companies", async () => {
    companyFindFirst.mockResolvedValue(comp({ customer: null }));
    invoiceFindMany.mockResolvedValue([sent]);
    const r = await reapplyTierToOpenInvoices("co1");
    expect(r.repriced).toBe(1);
    expect(r.regenerated).toBe(0);
    expect(createDraftOrderInvoice).not.toHaveBeenCalled();
  });

  it("counts a Shopify failure without blocking the re-price", async () => {
    createDraftOrderInvoice.mockRejectedValue(new Error("Shopify 500"));
    invoiceFindMany.mockResolvedValue([sent]);
    const r = await reapplyTierToOpenInvoices("co1");
    expect(r.repriced).toBe(1); // DB re-price still applied
    expect(r.regenerated).toBe(0);
    expect(r.shopifyFailures).toBe(1);
  });
});
