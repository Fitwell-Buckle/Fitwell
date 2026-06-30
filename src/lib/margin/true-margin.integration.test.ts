import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";

// Real-Postgres test, skipped unless TEST_DATABASE_URL is set. Isolated to a
// far-future processed_at window so only this test's orders are aggregated.
// SKUs have no PO cost basis, so COGS is 0 here (cost-join is covered by the
// cogs module's own tests + the pure rollUpMarginByChannel unit tests); this
// exercises the loader's SQL: channel grouping, line/shipping/refund joins,
// and sample exclusion.
const noDb = !process.env.TEST_DATABASE_URL;

const RUN = Date.now();
const FROM = new Date("2099-01-01T00:00:00.000Z");
const TO = new Date("2099-12-31T00:00:00.000Z");

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
      totalRefunded: number,
      lines: { sku: string; quantity: number; price: number }[],
      shippingCents: number,
    ) {
      const [o] = await db
        .insert(schema.order)
        .values({
          shopifyId: `itest-margin-${RUN}-${key}`,
          sourceName,
          isSample,
          totalRefunded,
          processedAt: new Date("2099-06-15T00:00:00.000Z"),
        })
        .returning({ id: schema.order.id });
      orderIds.push(o.id);
      if (lines.length)
        await db.insert(schema.orderLineItem).values(
          lines.map((l) => ({
            orderId: o.id,
            sku: `itest-${RUN}-${l.sku}`,
            quantity: l.quantity,
            price: l.price,
          })),
        );
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

    // D2C order: rev 10000, refund 500, shipping 600
    await mk("d", "web", false, 500, [{ sku: "X", quantity: 2, price: 5000 }], 600);
    // B2B order: rev 4000, refund 0, shipping 2000
    await mk("b", "shopify_draft_order", false, 0, [{ sku: "X", quantity: 1, price: 4000 }], 2000);
    // Sample order: must be EXCLUDED entirely
    await mk("s", "web", true, 0, [{ sku: "X", quantity: 1, price: 9999 }], 9999);
  });

  afterAll(async () => {
    if (noDb) return;
    await db
      .delete(schema.shippingCharge)
      .where(inArray(schema.shippingCharge.orderId, orderIds));
    await db
      .delete(schema.orderLineItem)
      .where(inArray(schema.orderLineItem.orderId, orderIds));
    await db.delete(schema.order).where(inArray(schema.order.id, orderIds));
  });

  it("aggregates contribution margin per channel, excluding samples", async () => {
    const rows = await getMarginByChannel({ from: FROM, to: TO });
    const by = Object.fromEntries(rows.map((r) => [r.channel, r]));

    expect(by.sample).toBeUndefined(); // sample excluded
    expect(rows.map((r) => r.channel)).toEqual(["d2c", "b2b"]); // canonical order

    // D2C: rev 10000, cogs 0 (uncosted), shipping 600, refunds 500
    expect(by.d2c).toMatchObject({
      orders: 1,
      revenueCents: 10000,
      cogsCents: 0,
      uncostedRevenueCents: 10000,
      shippingCostCents: 600,
      refundsCents: 500,
      contributionCents: 10000 - 0 - 600 - 500, // 8900
    });

    // B2B: rev 4000, shipping 2000, refunds 0
    expect(by.b2b).toMatchObject({
      orders: 1,
      revenueCents: 4000,
      shippingCostCents: 2000,
      refundsCents: 0,
      contributionCents: 4000 - 2000, // 2000
    });
  });
});
