import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  findFirst,
  dbUpdate,
  createDraftOrderInvoice,
  deleteDraftOrder,
  snapshotInvoiceDeposit,
  createInvoice,
  getBillingSettings,
  notifyNewB2bOrder,
} = vi.hoisted(() => ({
  findFirst: vi.fn(),
  dbUpdate: vi.fn(() => ({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) })),
  createDraftOrderInvoice: vi.fn(),
  deleteDraftOrder: vi.fn().mockResolvedValue(undefined),
  snapshotInvoiceDeposit: vi.fn().mockResolvedValue({ depositCents: 0, balanceCents: 0 }),
  createInvoice: vi.fn(),
  getBillingSettings: vi.fn().mockResolvedValue({ instructions: "Bank: Acme\nAcct: 123" }),
  notifyNewB2bOrder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  db: { query: { invoice: { findFirst } }, update: dbUpdate },
}));
vi.mock("@/lib/schema", () => ({
  invoice: { id: "id" },
  company: { id: "id" },
  invoiceLineItem: { invoiceId: "invoiceId" },
}));
vi.mock("@/lib/shopify/client", () => ({
  getShopifyClient: () => ({ createDraftOrderInvoice, deleteDraftOrder }),
}));
vi.mock("@/lib/invoicing/service", () => ({ createInvoice, snapshotInvoiceDeposit }));
vi.mock("@/lib/invoicing/billing-settings", () => ({ getBillingSettings }));
vi.mock("@/lib/invoicing/order-notifications", () => ({ notifyNewB2bOrder }));
// computeInvoiceTotals / computeDeposit are kept real (pure money math).

import { submitPortalOrder } from "./portal-orders";

const scope = { userId: "u1", companyId: "co1", email: "buyer@acme.com" };

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv1",
    invoiceNumber: "INV-00100",
    companyId: "co1",
    status: "sent",
    discountPercent: 50,
    shopifyDraftOrderId: "gid://shopify/DraftOrder/old",
    lineItems: [
      { shopifyVariantId: "gid://shopify/ProductVariant/1", title: "Buckle", quantity: 2, unitPriceCents: 4000 },
    ],
    company: {
      name: "Acme",
      contactEmail: "buyer@acme.com",
      depositPercent: 0,
      allowWirePayment: true,
      customer: { shopifyId: "gid://shopify/Customer/1" },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  createDraftOrderInvoice.mockResolvedValue({
    draftOrderId: "gid://shopify/DraftOrder/new",
    invoiceUrl: "https://pay.example/new",
  });
  getBillingSettings.mockResolvedValue({ instructions: "Bank: Acme\nAcct: 123" });
});

describe("submitPortalOrder", () => {
  it("rejects a wire submit when the brand isn't wire-enabled", async () => {
    findFirst.mockResolvedValue(order({ company: { ...order().company, allowWirePayment: false } }));
    const r = await submitPortalOrder(scope, "inv1", "wire");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
    expect(createDraftOrderInvoice).not.toHaveBeenCalled();
  });

  it("rejects submitting a paid order", async () => {
    findFirst.mockResolvedValue(order({ status: "paid" }));
    const r = await submitPortalOrder(scope, "inv1", "card");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
  });

  it("404s an order owned by another company", async () => {
    findFirst.mockResolvedValue(order({ companyId: "other" }));
    const r = await submitPortalOrder(scope, "inv1", "card");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });

  it("wire: full discounted total, no deposit, returns instructions, deletes stale draft", async () => {
    findFirst.mockResolvedValue(order());
    const r = await submitPortalOrder(scope, "inv1", "wire");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.paymentMethod).toBe("wire");
    expect(r.payUrl).toBeNull();
    expect(r.wireInstructions).toContain("Bank: Acme");
    expect(r.totalCents).toBe(4000); // 2 × $40 − 50%
    expect(r.deposit).toBeNull();
    // Regenerating an already-sent order deletes the stale Shopify draft.
    expect(deleteDraftOrder).toHaveBeenCalledWith("gid://shopify/DraftOrder/old");
    // Full discount applied to the real product lines (no deposit custom line).
    expect(createDraftOrderInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        discountPercent: 50,
        lines: [
          expect.objectContaining({ variantId: "gid://shopify/ProductVariant/1", quantity: 2 }),
        ],
      }),
    );
  });

  it("passes the order's stored ship-to address to Shopify", async () => {
    findFirst.mockResolvedValue(
      order({
        shipTo: {
          addressId: "a1",
          firstName: "Sam",
          lastName: "Byon",
          address1: "1 Main St",
          city: "Austin",
          province: "Texas",
          provinceCode: "TX",
          country: "United States",
          zip: "78701",
        },
      }),
    );
    const r = await submitPortalOrder(scope, "inv1", "card");
    expect(r.ok).toBe(true);
    expect(createDraftOrderInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        shippingAddress: expect.objectContaining({
          address1: "1 Main St",
          city: "Austin",
          province: "Texas",
        }),
      }),
    );
  });

  it("notifies admins on a NEW order (first submit, draft → sent) but not on re-submit", async () => {
    // First submit: the invoice was a draft.
    findFirst.mockResolvedValue(order({ status: "draft" }));
    await submitPortalOrder(scope, "inv1", "wire");
    expect(notifyNewB2bOrder).toHaveBeenCalledTimes(1);
    expect(notifyNewB2bOrder).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceNumber: "INV-00100", companyName: "Acme", paymentMethod: "wire" }),
    );

    // Re-submit / edit of an already-sent order: no new-order notification.
    notifyNewB2bOrder.mockClear();
    findFirst.mockResolvedValue(order({ status: "sent" }));
    await submitPortalOrder(scope, "inv1", "card");
    expect(notifyNewB2bOrder).not.toHaveBeenCalled();
  });

  it("split fulfillment: per-line 'Ship to' attributes + a split note", async () => {
    findFirst.mockResolvedValue(
      order({
        shipTo: { addressId: "p", firstName: "HQ", address1: "1 HQ St", city: "Austin", provinceCode: "TX" },
        lineItems: [
          { shopifyVariantId: "gid://shopify/ProductVariant/1", sku: "A", title: "Buckle A", quantity: 2, unitPriceCents: 4000, shipTo: null },
          {
            shopifyVariantId: "gid://shopify/ProductVariant/2",
            sku: "B",
            title: "Buckle B",
            quantity: 1,
            unitPriceCents: 4000,
            shipTo: { addressId: "w", firstName: "WH", address1: "9 Dock Rd", city: "Reno", provinceCode: "NV" },
          },
        ],
      }),
    );
    const r = await submitPortalOrder(scope, "inv1", "card");
    expect(r.ok).toBe(true);

    const call = createDraftOrderInvoice.mock.calls[0][0];
    expect(call.note).toContain("Split fulfillment");
    const lineB = call.lines.find((l: { title: string }) => l.title === "Buckle B");
    const lineA = call.lines.find((l: { title: string }) => l.title === "Buckle A");
    // B ships to its own address; A falls back to the order's default (HQ).
    expect(lineB.customAttributes).toEqual([
      { key: "Ship to", value: expect.stringContaining("9 Dock Rd") },
    ]);
    expect(lineA.customAttributes).toEqual([
      { key: "Ship to", value: expect.stringContaining("1 HQ St") },
    ]);
  });

  it("card with a deposit: bills only the deposit as a custom line", async () => {
    findFirst.mockResolvedValue(
      order({ company: { ...order().company, depositPercent: 50 } }),
    );
    const r = await submitPortalOrder(scope, "inv1", "card");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.deposit).toEqual({ percent: 50, depositCents: 2000, balanceCents: 2000 });
    expect(r.payUrl).toBe("https://pay.example/new");
    expect(createDraftOrderInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        discountPercent: 0,
        lines: [expect.objectContaining({ variantId: null, unitPriceCents: 2000, quantity: 1 })],
      }),
    );
  });
});
