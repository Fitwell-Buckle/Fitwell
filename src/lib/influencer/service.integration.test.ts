import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

// Gifting-order service against real Postgres: recordInfluencerOrder +
// getInfluencerOrderDetail, attachments, and line replacement (split ship-to +
// gift-total recompute). Runs only with TEST_DATABASE_URL; otherwise skipped.
const noDb = !process.env.TEST_DATABASE_URL;
const RUN = Date.now();

describe.skipIf(noDb)("influencer order service (real DB)", () => {
  let db: typeof import("@/lib/db").db;
  let schema: typeof import("@/lib/schema");
  let svc: typeof import("./service");

  let influencerId: string;

  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    schema = await import("@/lib/schema");
    svc = await import("./service");

    const made = await svc.createInfluencer({
      name: `itest-inf-${RUN}`,
      handle: "@itest",
      platform: "instagram",
    });
    influencerId = made.id;
  });

  afterAll(async () => {
    if (noDb) return;
    // Orders cascade their line items + attachments on delete.
    await db
      .delete(schema.influencerOrder)
      .where(eq(schema.influencerOrder.influencerId, influencerId));
    await db
      .delete(schema.influencer)
      .where(eq(schema.influencer.id, influencerId));
  });

  it("records a gifting order at 100% off and loads its detail", async () => {
    const order = await svc.recordInfluencerOrder({
      influencerId,
      lineItems: [
        { sku: "G1", title: "Buckle A", quantity: 2, unitPriceCents: 5000, shopifyVariantId: "v1" },
        { sku: "G2", title: "Buckle B", quantity: 1, unitPriceCents: 2500, shopifyVariantId: "v2" },
      ],
      contentDueDate: "2026-07-01",
    });
    expect(order.orderNumber).toMatch(/^GIFT-\d{5,}$/);

    const detail = await svc.getInfluencerOrderDetail(order.id);
    expect(detail).toBeTruthy();
    expect(detail!.lineItems).toHaveLength(2);
    expect(detail!.subtotalCents).toBe(12500); // 2×5000 + 1×2500 (retail gift value)
    expect(detail!.discountCents).toBe(12500); // 100% off
    expect(detail!.totalCents).toBe(0); // gifting → charged nothing
    expect(detail!.influencer?.name).toBe(`itest-inf-${RUN}`);
    expect(detail!.attachments).toHaveLength(0);
    expect(Array.isArray(detail!.addresses)).toBe(true); // none (no linked customer)
  });

  it("persists order-level + per-line ship-to passed to recordInfluencerOrder", async () => {
    const ship = {
      addressId: "addr-rec",
      firstName: "Gift",
      address1: "5 Sample St",
      city: "Reno",
      provinceCode: "NV",
      zip: "89501",
    };
    const order = await svc.recordInfluencerOrder({
      influencerId,
      shipTo: ship,
      lineItems: [
        { sku: "G1", title: "Buckle A", quantity: 1, unitPriceCents: 5000, shopifyVariantId: "v1", shipTo: ship },
        { sku: "G2", title: "Buckle B", quantity: 1, unitPriceCents: 2500, shopifyVariantId: "v2" },
      ],
    });

    const detail = await svc.getInfluencerOrderDetail(order.id);
    expect(detail!.shipTo?.city).toBe("Reno");
    const a = detail!.lineItems.find((l) => l.sku === "G1")!;
    const b = detail!.lineItems.find((l) => l.sku === "G2")!;
    expect(a.shipTo?.city).toBe("Reno"); // per-line split snapshot
    expect(b.shipTo).toBeNull(); // ships to the order default
  });

  it("attaches a document and surfaces it on the order detail", async () => {
    const order = await svc.recordInfluencerOrder({
      influencerId,
      lineItems: [
        { sku: "G1", title: "Buckle A", quantity: 1, unitPriceCents: 5000, shopifyVariantId: "v1" },
      ],
    });
    await svc.addInfluencerOrderAttachment({
      orderId: order.id,
      blobUrl: "https://blob.test/brief.pdf",
      filename: "brief.pdf",
      contentType: "application/pdf",
      sizeBytes: 1234,
    });

    const detail = await svc.getInfluencerOrderDetail(order.id);
    expect(detail!.attachments).toHaveLength(1);
    expect(detail!.attachments[0].filename).toBe("brief.pdf");
    expect(detail!.attachments[0].sizeBytes).toBe(1234);
  });

  it("replaces line items with per-line ship-to and recomputes gift totals", async () => {
    const order = await svc.recordInfluencerOrder({
      influencerId,
      lineItems: [
        { sku: "G1", title: "Buckle A", quantity: 1, unitPriceCents: 5000, shopifyVariantId: "v1" },
      ],
    });

    const ship = {
      addressId: "addr-1",
      firstName: "Gift",
      lastName: "Recipient",
      address1: "9 Dock Rd",
      city: "Reno",
      provinceCode: "NV",
      zip: "89501",
    };
    const res = await svc.saveInfluencerOrderLines(order.id, {
      lineItems: [
        { sku: "G3", title: "Buckle C", quantity: 3, unitPriceCents: 4000, shopifyVariantId: "v3", shipTo: ship },
        { sku: "G4", title: "Buckle D", quantity: 2, unitPriceCents: 1000, shopifyVariantId: "v4" },
      ],
      shipTo: ship,
    });
    expect(res.ok).toBe(true);

    const detail = await svc.getInfluencerOrderDetail(order.id);
    expect(detail!.lineItems).toHaveLength(2);
    expect(detail!.subtotalCents).toBe(14000); // 3×4000 + 2×1000
    expect(detail!.totalCents).toBe(0); // still 100% off
    const c = detail!.lineItems.find((l) => l.sku === "G3")!;
    expect(c.shipTo?.city).toBe("Reno"); // per-line split snapshot persisted
    expect(detail!.shipTo?.city).toBe("Reno"); // order-level default persisted
  });

  it("refuses to edit a cancelled order", async () => {
    const order = await svc.recordInfluencerOrder({
      influencerId,
      lineItems: [
        { sku: "G1", title: "Buckle A", quantity: 1, unitPriceCents: 5000, shopifyVariantId: "v1" },
      ],
    });
    await svc.updateInfluencerOrder(order.id, { status: "cancelled" });
    const res = await svc.saveInfluencerOrderLines(order.id, {
      lineItems: [
        { sku: "G1", title: "Buckle A", quantity: 1, unitPriceCents: 5000 },
      ],
    });
    expect(res).toEqual({ ok: false, status: 409, error: "Can't edit a cancelled order." });
  });
});
