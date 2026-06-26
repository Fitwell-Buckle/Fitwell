import { describe, it, expect, vi, beforeEach } from "vitest";

// webhooks.ts pulls in the live db, Shopify client, and a web of invoicing /
// catalog helpers at import. Stub every side-effecting dependency so we can
// assert pure routing: which topic drives which sync call.
const { mockDb, mocks } = vi.hoisted(() => {
  const where = vi.fn(async () => undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return {
    mockDb: { update, query: { invoice: { findFirst: vi.fn() } } },
    mocks: {
      where,
      set,
      update,
      upsertOrder: vi.fn(async () => undefined),
      upsertCustomer: vi.fn(async () => undefined),
      syncGiftOrderLogistics: vi.fn(async () => undefined),
      getOrder: vi.fn(async () => ({ id: 555, fulfillment_status: "fulfilled" })),
    },
  };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("./sync", () => ({
  upsertOrder: mocks.upsertOrder,
  upsertCustomer: mocks.upsertCustomer,
}));
vi.mock("./client", () => ({
  getShopifyClient: () => ({ getOrder: mocks.getOrder }),
}));
vi.mock("./sku-barcode-sync", () => ({ syncProductBarcodes: vi.fn() }));
vi.mock("@/lib/creators/gift-logistics", () => ({
  syncGiftOrderLogistics: mocks.syncGiftOrderLogistics,
}));
vi.mock("@/lib/catalog/load", () => ({ CATALOG_CACHE_TAG: "catalog" }));
vi.mock("@/lib/invoicing/service", () => ({
  markDepositPaid: vi.fn(),
  markBalancePaid: vi.fn(),
}));
vi.mock("@/lib/invoicing/order-notifications", () => ({
  notifyB2bPayment: vi.fn(),
}));
vi.mock("@/lib/invoicing/payment-reconcile", () => ({
  classifyDraftPayment: vi.fn(),
  paymentAmountCents: vi.fn(),
}));

import { handleWebhookTopic } from "./webhooks";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleWebhookTopic — orders/cancelled", () => {
  it("upserts the cancelled order from the payload", async () => {
    const payload = { id: 42, cancelled_at: "2026-06-26T00:00:00Z" };
    await handleWebhookTopic("orders/cancelled", payload);
    expect(mocks.upsertOrder).toHaveBeenCalledTimes(1);
    expect(mocks.upsertOrder).toHaveBeenCalledWith(payload);
  });
});

describe("handleWebhookTopic — fulfillments", () => {
  for (const topic of ["fulfillments/create", "fulfillments/update"]) {
    it(`${topic} re-fetches the order, upserts it, and syncs gift logistics`, async () => {
      await handleWebhookTopic(topic, { id: 9, order_id: 555 });
      expect(mocks.getOrder).toHaveBeenCalledWith(555);
      const fetched = await mocks.getOrder.mock.results[0].value;
      expect(mocks.upsertOrder).toHaveBeenCalledWith(fetched);
      expect(mocks.syncGiftOrderLogistics).toHaveBeenCalledWith(fetched);
      expect(mocks.update).not.toHaveBeenCalled();
    });
  }

  it("falls back to flipping fulfillment_status when the order fetch fails", async () => {
    mocks.getOrder.mockRejectedValueOnce(new Error("boom"));
    await handleWebhookTopic("fulfillments/update", {
      id: 9,
      order_id: 555,
      status: "partial",
    });
    expect(mocks.upsertOrder).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ fulfillmentStatus: "partial" }),
    );
  });

  it("no-ops when the payload has no order_id", async () => {
    await handleWebhookTopic("fulfillments/create", { id: 9 });
    expect(mocks.getOrder).not.toHaveBeenCalled();
    expect(mocks.upsertOrder).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
