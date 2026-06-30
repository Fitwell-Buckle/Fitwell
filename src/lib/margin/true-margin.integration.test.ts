import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";

// Real-Postgres test, skipped unless TEST_DATABASE_URL is set. Isolated to a
// far-future processed_at window so only this test's orders are aggregated.
// Revenue is the order SUBTOTAL; COGS comes from the standard-cost classifier
// (a "Fitwell Model One Stainless" line → $3.60/unit).
const noDb = !process.env.TEST_DATABASE_URL;

const RUN = Date.now();
const FROM = new Date("2099-01-01T00:00:00.000Z");
const TO = new Date("2099-12-31T00:00:00.000Z");
const SKU = `itest-buckle-${RUN}`;

describe.skipIf(noDb)("getMarginByChannel (real DB)", () => {
  let db: typeof import("@/lib/db").db;
  let schema: typeof import("@/lib/schema");
  let getMarginByChannel: typeof import("./true-margin").getMarginByChannel;
  const orderIds: string[] = [];

  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    schema = await import("@/lib/schema");
    ({ getMarginByChannel } = await import("./true-margin"));

    async function mk(
      key: string,
      sourceName: string | null,
      isSample: boolean,
      subtotal: number,
      totalRefunded: number,
      qty: number,
      shippingCents: number,
    ) {
      const [o] = await db
        .insert(schema.order)
        .values({
          shopifyId: `itest-margin-${RUN}-${key}`,
          sourceName,
          isSample,
          subtotalPrice: subtotal,
          totalRefunded,
          processedAt: new Date("2099-06-15T00:00:00.000Z"),
        })
        .returning({ id: schema.order.id });
      orderIds.push(o.id);
      if (qty > 0)
        await db.insert(schema.orderLineItem).values({
          orderId: o.id,
          sku: SKU,
          title: "Fitwell Model One Stainless",
          variantTitle: "18mm Width / 316L Stainless Steel / Natural (silver)",
          quantity: qty,
          price: 4000, // retail line price — must be IGNORED for revenue
        });
      if (shippingCents)
        await db.insert(schema.shippingCharge).values({
          orderId: o.id,
          billNumber: `itest-margin-${RUN}`,
          orderName: `FBC-${key}`,
          chargeCategory: "shipping_fee",
          amountCents: shippingCents,
        });
      return o.id;
    }

    // D2C (web): subtotal 10000, 2 buckles → cogs 720, refund 500, shipping 600
    await mk("d", "web", false, 10000, 500, 2, 600);
    // B2B (draft): subtotal 4000 (wholesale, NOT the 4000 retail line), 1 buckle
    // → cogs 360, shipping 2000
    await mk("b", "shopify_draft_order", false, 4000, 0, 1, 2000);
    // Sample: excluded entirely
    await mk("s", "web", true, 9999, 0, 1, 0);
  });

  afterAll(async () => {
    if (noDb) return;
    await db.delete(schema.shippingCharge).where(inArray(schema.shippingCharge.orderId, orderIds));
    await db.delete(schema.orderLineItem).where(inArray(schema.orderLineItem.orderId, orderIds));
    await db.delete(schema.order).where(inArray(schema.order.id, orderIds));
  });

  it("uses net subtotal revenue and per-order COGS, split by channel", async () => {
    const rows = await getMarginByChannel({ from: FROM, to: TO });
    const by = Object.fromEntries(rows.map((r) => [r.channel, r]));

    expect(by.sample).toBeUndefined();
    expect(rows.map((r) => r.channel)).toEqual(["d2c", "b2b"]);

    // D2C: revenue is the 10000 SUBTOTAL (not 2×4000 retail lines); cogs 2×360.
    expect(by.d2c).toMatchObject({
      orders: 1,
      revenueCents: 10000,
      cogsCents: 720,
      costedRevenueCents: 10000,
      shippingCostCents: 600,
      refundsCents: 500,
      contributionCents: 10000 - 720 - 600 - 500, // 8180
    });

    // B2B: revenue is the 4000 wholesale subtotal; cogs 360.
    expect(by.b2b).toMatchObject({
      orders: 1,
      revenueCents: 4000,
      cogsCents: 360,
      shippingCostCents: 2000,
      contributionCents: 4000 - 360 - 2000, // 1640
    });
  });
});
