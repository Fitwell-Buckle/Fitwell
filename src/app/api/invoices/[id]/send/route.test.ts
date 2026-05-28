import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  auth,
  getInvoiceDetail,
  updateInvoiceStatus,
  snapshotInvoiceDeposit,
  computeDeposit,
  buildInvoiceEmailHtml,
  getBillingSettings,
  sendEmail,
  createDraftOrderInvoice,
  dbUpdate,
} = vi.hoisted(() => ({
  auth: vi.fn(),
  getInvoiceDetail: vi.fn(),
  updateInvoiceStatus: vi.fn().mockResolvedValue(undefined),
  snapshotInvoiceDeposit: vi
    .fn()
    .mockResolvedValue({ depositCents: 0, balanceCents: 0 }),
  computeDeposit: vi.fn(() => ({ depositCents: 0, balanceCents: 0 })),
  buildInvoiceEmailHtml: vi.fn(() => "<html></html>"),
  getBillingSettings: vi.fn().mockResolvedValue({ instructions: null }),
  sendEmail: vi.fn().mockResolvedValue(undefined),
  createDraftOrderInvoice: vi.fn(),
  dbUpdate: vi.fn(() => ({
    set: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
  })),
}));

vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/db", () => ({ db: { update: dbUpdate } }));
vi.mock("@/lib/schema", () => ({ invoice: { id: "id" } }));
vi.mock("@/lib/invoicing/service", () => ({
  getInvoiceDetail,
  updateInvoiceStatus,
  snapshotInvoiceDeposit,
}));
vi.mock("@/lib/invoicing/invoicing", () => ({ computeDeposit }));
vi.mock("@/lib/invoicing/email", () => ({ buildInvoiceEmailHtml }));
vi.mock("@/lib/invoicing/billing-settings", () => ({ getBillingSettings }));
vi.mock("@/lib/email/resend", () => ({ sendEmail }));
vi.mock("@/lib/shopify/client", () => ({
  getShopifyClient: () => ({ createDraftOrderInvoice }),
}));

import { POST } from "./route";

function makeReq(body: unknown = { to: "buyer@acme.com" }) {
  return new Request("https://admin.fitwellbuckle.co/api/invoices/inv1/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "inv1" }) };

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv1",
    invoiceNumber: "INV-00100",
    status: "draft",
    subtotalCents: 12000,
    discountPercent: 50,
    discountCents: 6000,
    totalCents: 6000,
    issuedDate: new Date("2026-05-27"),
    dueDate: new Date("2026-06-27"),
    notes: null,
    shopifyInvoiceUrl: null,
    lineItems: [
      {
        sku: "FWB-1",
        title: "Buckle",
        quantity: 1,
        unitPriceCents: 4000,
        shopifyVariantId: "gid://shopify/ProductVariant/1",
      },
    ],
    company: {
      name: "Acme",
      contactEmail: "buyer@acme.com",
      depositPercent: 0,
      // Linked to a Shopify customer → a payment link is expected.
      customer: { shopifyId: "gid://shopify/Customer/1" },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { role: "admin", email: "me@fitwellbuckle.co" } });
});

describe("POST /api/invoices/[id]/send — payment-link failures block the send", () => {
  it("blocks with 409 when the draft order fails for a missing scope", async () => {
    getInvoiceDetail.mockResolvedValue(invoice());
    createDraftOrderInvoice.mockRejectedValue(
      new Error("access denied: write_draft_orders required"),
    );

    const res = await POST(makeReq(), ctx);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/write_draft_orders/);
    // Did not email, did not mark sent.
    expect(sendEmail).not.toHaveBeenCalled();
    expect(updateInvoiceStatus).not.toHaveBeenCalled();
  });

  it("blocks with 502 when the draft order fails for any other reason", async () => {
    getInvoiceDetail.mockResolvedValue(invoice());
    createDraftOrderInvoice.mockRejectedValue(new Error("Shopify 500"));

    const res = await POST(makeReq(), ctx);

    expect(res.status).toBe(502);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(updateInvoiceStatus).not.toHaveBeenCalled();
  });

  it("still sends for a company not linked to Shopify (no link expected)", async () => {
    getInvoiceDetail.mockResolvedValue(
      invoice({ company: { name: "Acme", contactEmail: "buyer@acme.com", depositPercent: 0, customer: null } }),
    );

    const res = await POST(makeReq(), ctx);

    expect(res.status).toBe(200);
    expect(createDraftOrderInvoice).not.toHaveBeenCalled();
    expect(updateInvoiceStatus).toHaveBeenCalledWith("inv1", "sent");
  });

  it("sends and marks sent when the draft order succeeds", async () => {
    getInvoiceDetail.mockResolvedValue(invoice());
    createDraftOrderInvoice.mockResolvedValue({
      draftOrderId: "gid://shopify/DraftOrder/9",
      invoiceUrl: "https://pay.example/abc",
    });

    const res = await POST(makeReq(), ctx);

    expect(res.status).toBe(200);
    expect(updateInvoiceStatus).toHaveBeenCalledWith("inv1", "sent");
  });
});
