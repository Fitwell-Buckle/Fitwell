import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";

// receivePo against real Postgres with a mocked Shopify client (no real
// inventory writes). Proves the per-line idempotency that makes C2 safe.
// Runs only when TEST_DATABASE_URL is set; otherwise skipped.
const noDb = !process.env.TEST_DATABASE_URL;
const RUN = Date.now();

const adjust = vi.hoisted(() => vi.fn(async () => ({ available: 42 })));
vi.mock("@/lib/shopify/client", () => ({
  getShopifyClient: () => ({ adjustInventory: adjust }),
}));

describe.skipIf(noDb)("receivePo (real DB, mocked Shopify)", () => {
  let db: typeof import("@/lib/db").db;
  let schema: typeof import("@/lib/schema");
  let svc: typeof import("./service");
  let receive: typeof import("./receive");
  let supplierId: string;
  let poId: string;

  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    schema = await import("@/lib/schema");
    svc = await import("./service");
    receive = await import("./receive");

    const [s] = await db
      .insert(schema.supplier)
      .values({ name: `itest-recv-${RUN}` })
      .returning({ id: schema.supplier.id });
    supplierId = s.id;

    const created = await svc.createPo({
      supplierId,
      shopifyPoNumber: `PO-recv-${RUN}`,
      issuedDate: "2026-05-01",
      shopifyLocationId: "555", // PO-level warehouse
      lineItems: [
        { sku: "A", title: "Buckle A", quantity: 10, shopifyVariantId: "111" },
        { sku: "B", title: "Buckle B", quantity: 5, shopifyVariantId: "222" },
      ],
    });
    poId = created.poId;

    // Move both lines to complete so they're receivable.
    await db
      .update(schema.productionPoLineItem)
      .set({ currentStage: "complete" })
      .where(eq(schema.productionPoLineItem.poId, poId));
  });

  afterAll(async () => {
    if (noDb) return;
    await db.delete(schema.productionPo).where(eq(schema.productionPo.id, poId));
    await db.delete(schema.supplier).where(eq(schema.supplier.id, supplierId));
  });

  it("pushes an adjustment per line and marks the PO fully received", async () => {
    adjust.mockClear();
    const res = await receive.receivePo(poId);

    expect(res.poFullyReceived).toBe(true);
    expect(res.received).toHaveLength(2);
    expect(res.skipped).toHaveLength(0);
    expect(res.failed).toHaveLength(0);
    expect(adjust).toHaveBeenCalledTimes(2);

    // Correct deltas pushed (qty 10 and 5).
    const deltas = adjust.mock.calls
      .map((c) => (c[0] as { delta: number }).delta)
      .sort((a, b) => a - b);
    expect(deltas).toEqual([5, 10]);

    const po = await svc.getPoDetail(poId);
    expect(po!.shopifyReceivedAt).toBeInstanceOf(Date);
    for (const li of po!.lineItems) {
      expect(li.shopifyReceivedAt).toBeInstanceOf(Date);
    }
  });

  it("is idempotent: a second receive pushes nothing", async () => {
    adjust.mockClear();
    const res = await receive.receivePo(poId);

    expect(adjust).not.toHaveBeenCalled();
    expect(res.received).toHaveLength(2); // both already received
    expect(res.skipped).toHaveLength(0);
    expect(res.failed).toHaveLength(0);
    expect(res.poFullyReceived).toBe(true);
  });
});
