import { describe, it, expect, vi, beforeEach } from "vitest";

const { getCompanyScope, savePortalOrderLines, submitPortalOrder } = vi.hoisted(() => ({
  getCompanyScope: vi.fn(),
  savePortalOrderLines: vi.fn(),
  submitPortalOrder: vi.fn(),
}));

vi.mock("@/lib/portal/company-session", () => ({ getCompanyScope }));
vi.mock("@/lib/portal/addresses", () => ({
  resolveOrderShipTos: vi.fn().mockResolvedValue({ orderShipTo: undefined, lineShipTos: [] }),
}));
vi.mock("@/lib/invoicing/portal-orders", () => ({ savePortalOrderLines, submitPortalOrder }));

import { PATCH } from "./route";

function makeReq(body: unknown) {
  return new Request("https://portal.fitwellbuckle.co/api/portal/orders/inv1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "inv1" }) };
const cart = { lineItems: [{ shopifyVariantId: "gid://v/1", quantity: 3 }] };

beforeEach(() => {
  vi.clearAllMocks();
  getCompanyScope.mockResolvedValue({ companyId: "co1", email: "buyer@acme.com" });
  savePortalOrderLines.mockResolvedValue({ ok: true, status: "draft", paymentMethod: "card" });
  submitPortalOrder.mockResolvedValue({
    ok: true,
    invoiceId: "inv1",
    invoiceNumber: "INV-00100",
    paymentMethod: "card",
    payUrl: "https://pay.example/new",
    wireInstructions: null,
    totalCents: 9000,
    deposit: null,
  });
});

describe("PATCH /api/portal/orders/[id]", () => {
  it("403s without a company scope", async () => {
    getCompanyScope.mockResolvedValue(null);
    const res = await PATCH(makeReq(cart), ctx);
    expect(res.status).toBe(403);
    expect(savePortalOrderLines).not.toHaveBeenCalled();
  });

  it("saves draft edits without submitting (no Shopify)", async () => {
    savePortalOrderLines.mockResolvedValue({ ok: true, status: "draft", paymentMethod: "card" });
    const res = await PATCH(makeReq(cart), ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.status).toBe("draft");
    expect(submitPortalOrder).not.toHaveBeenCalled();
  });

  it("regenerates the pay link when editing an already-sent order (implicit submit)", async () => {
    // Saving a 'sent' order with no explicit submit must re-submit with its
    // existing method so the live pay link matches the new total.
    savePortalOrderLines.mockResolvedValue({ ok: true, status: "sent", paymentMethod: "wire" });
    const res = await PATCH(makeReq(cart), ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(submitPortalOrder).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "co1" }),
      "inv1",
      "wire",
    );
    expect(body.data.status).toBe("sent");
  });

  it("submits a draft for payment when submit is set", async () => {
    savePortalOrderLines.mockResolvedValue({ ok: true, status: "draft", paymentMethod: "card" });
    const res = await PATCH(makeReq({ ...cart, submit: "card" }), ctx);
    expect(submitPortalOrder).toHaveBeenCalledWith(expect.anything(), "inv1", "card");
  });

  it("propagates a save error (e.g. paid order) and never submits", async () => {
    savePortalOrderLines.mockResolvedValue({ ok: false, status: 409, error: "Can't edit a paid order." });
    const res = await PATCH(makeReq(cart), ctx);
    expect(res.status).toBe(409);
    expect(submitPortalOrder).not.toHaveBeenCalled();
  });
});
