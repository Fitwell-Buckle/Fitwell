import { describe, it, expect, vi, beforeEach } from "vitest";

const { getCompanyScope, createPortalDraft, submitPortalOrder } = vi.hoisted(() => ({
  getCompanyScope: vi.fn(),
  createPortalDraft: vi.fn(),
  submitPortalOrder: vi.fn(),
}));

vi.mock("@/lib/portal/company-session", () => ({ getCompanyScope }));
vi.mock("@/lib/portal/addresses", () => ({ resolveShipTo: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/invoicing/portal-orders", () => ({ createPortalDraft, submitPortalOrder }));

import { POST } from "./route";

function makeReq(body: unknown) {
  return new Request("https://portal.fitwellbuckle.co/api/portal/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const cart = { lineItems: [{ shopifyVariantId: "gid://v/1", quantity: 2 }] };

beforeEach(() => {
  vi.clearAllMocks();
  getCompanyScope.mockResolvedValue({ companyId: "co1", email: "buyer@acme.com" });
  createPortalDraft.mockResolvedValue({ ok: true, invoiceId: "inv1", invoiceNumber: "INV-00100" });
  submitPortalOrder.mockResolvedValue({
    ok: true,
    invoiceId: "inv1",
    invoiceNumber: "INV-00100",
    paymentMethod: "card",
    payUrl: "https://pay.example/abc",
    wireInstructions: null,
    totalCents: 6000,
    deposit: null,
  });
});

describe("POST /api/portal/orders", () => {
  it("403s without a company scope", async () => {
    getCompanyScope.mockResolvedValue(null);
    const res = await POST(makeReq(cart));
    expect(res.status).toBe(403);
    expect(createPortalDraft).not.toHaveBeenCalled();
  });

  it("saves a draft (no submit) without creating any Shopify transaction", async () => {
    const res = await POST(makeReq(cart));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.status).toBe("draft");
    expect(body.data.invoiceId).toBe("inv1");
    expect(submitPortalOrder).not.toHaveBeenCalled();
  });

  it("creates + submits when submit is set", async () => {
    const res = await POST(makeReq({ ...cart, submit: "card" }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(submitPortalOrder).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "co1" }),
      "inv1",
      "card",
    );
    expect(body.data.status).toBe("sent");
    expect(body.data.payUrl).toBe("https://pay.example/abc");
  });

  it("propagates a draft-creation error and never submits", async () => {
    createPortalDraft.mockResolvedValue({ ok: false, status: 400, error: "Item unavailable." });
    const res = await POST(makeReq({ ...cart, submit: "card" }));
    expect(res.status).toBe(400);
    expect(submitPortalOrder).not.toHaveBeenCalled();
  });
});
