import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  auth,
  getInfluencerOrderDetail,
  buildGiftDraftOrder,
  buildGiftEmailHtml,
  sendEmail,
  dbUpdate,
} = vi.hoisted(() => ({
  auth: vi.fn(),
  getInfluencerOrderDetail: vi.fn(),
  buildGiftDraftOrder: vi.fn(),
  buildGiftEmailHtml: vi.fn(() => "<html></html>"),
  sendEmail: vi.fn().mockResolvedValue(undefined),
  dbUpdate: vi.fn(() => ({
    set: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
  })),
}));

vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/db", () => ({ db: { update: dbUpdate } }));
vi.mock("@/lib/schema", () => ({ influencerOrder: { id: "id" } }));
vi.mock("@/lib/influencer/service", () => ({
  getInfluencerOrderDetail,
  buildGiftDraftOrder,
}));
vi.mock("@/lib/invoicing/email", () => ({ buildGiftEmailHtml }));
vi.mock("@/lib/email/resend", () => ({ sendEmail }));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "ord1" }) };
function makeReq() {
  return new Request("https://portal.fitwellbuckle.co/api/influencer-orders/ord1/send", {
    method: "POST",
  });
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "ord1",
    orderNumber: "GIFT-00100",
    status: "draft",
    issuedDate: "2026-06-01",
    contentDueDate: "2026-07-01",
    affiliateLink: "https://fitwell.test/ref/x",
    subtotalCents: 12500,
    notes: null,
    shopifyInvoiceUrl: null,
    shipTo: null,
    lineItems: [
      {
        sku: "G1",
        title: "Buckle",
        quantity: 2,
        unitPriceCents: 5000,
        shopifyVariantId: "gid://shopify/ProductVariant/1",
        shipTo: null,
      },
    ],
    influencer: {
      name: "Maker Minute",
      contactEmail: "creator@maker.test",
      // Linked to a Shopify customer → a gifting draft order is expected.
      customer: { shopifyId: "gid://shopify/Customer/1" },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { role: "admin", email: "me@fitwellbuckle.co" } });
});

describe("POST /api/influencer-orders/[id]/send", () => {
  it("403s for company / supplier roles", async () => {
    auth.mockResolvedValue({ user: { role: "company" } });
    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(403);
    expect(getInfluencerOrderDetail).not.toHaveBeenCalled();
  });

  it("blocks with 409 when the gifting draft fails for a missing scope", async () => {
    getInfluencerOrderDetail.mockResolvedValue(order());
    buildGiftDraftOrder.mockRejectedValue(
      new Error("access denied: write_draft_orders required"),
    );

    const res = await POST(makeReq(), ctx);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/write_draft_orders/);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(dbUpdate).not.toHaveBeenCalled(); // not marked sent
  });

  it("blocks with 502 when the gifting draft fails for any other reason", async () => {
    getInfluencerOrderDetail.mockResolvedValue(order());
    buildGiftDraftOrder.mockRejectedValue(new Error("Shopify 500"));

    const res = await POST(makeReq(), ctx);

    expect(res.status).toBe(502);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("refuses to send a cancelled order", async () => {
    getInfluencerOrderDetail.mockResolvedValue(order({ status: "cancelled" }));
    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(409);
    expect(buildGiftDraftOrder).not.toHaveBeenCalled();
  });

  it("still sends (no draft) for an influencer not linked to Shopify", async () => {
    getInfluencerOrderDetail.mockResolvedValue(
      order({ influencer: { name: "Maker", contactEmail: "creator@maker.test", customer: null } }),
    );
    process.env.RESEND_API_KEY = "re_test";

    const res = await POST(makeReq(), ctx);

    expect(res.status).toBe(200);
    expect(buildGiftDraftOrder).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1); // gift email sent
    expect(dbUpdate).toHaveBeenCalled(); // marked sent
    delete process.env.RESEND_API_KEY;
  });

  it("creates the gifting draft (100% off), emails, and marks sent on success", async () => {
    getInfluencerOrderDetail.mockResolvedValue(order());
    buildGiftDraftOrder.mockResolvedValue({
      draftOrderId: "gid://shopify/DraftOrder/9",
      invoiceUrl: "https://shop.example/gift/9",
    });
    process.env.RESEND_API_KEY = "re_test";

    const res = await POST(makeReq(), ctx);

    expect(res.status).toBe(200);
    expect(buildGiftDraftOrder).toHaveBeenCalledTimes(1);
    expect(buildGiftEmailHtml).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(dbUpdate).toHaveBeenCalled(); // shopify link + sent
    delete process.env.RESEND_API_KEY;
  });
});
