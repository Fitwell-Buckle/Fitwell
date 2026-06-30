import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";

// Real-Postgres test. Runs only when TEST_DATABASE_URL is set (a Neon dev
// branch); otherwise skipped. Isolated to a unique far-future processed_at
// window so the channel aggregation only sees this test's orders.
const noDb = !process.env.TEST_DATABASE_URL;

const RUN = Date.now();
const FROM = new Date("2099-01-01T00:00:00.000Z");
const TO = new Date("2099-12-31T00:00:00.000Z");
const D = (day: number) => new Date(`2099-06-${String(day).padStart(2, "0")}T00:00:00.000Z`);

describe.skipIf(noDb)("getShippingCostByChannel (real DB)", () => {
  let db: typeof import("@/lib/db").db;
  let schema: typeof import("@/lib/schema");
  let lib: typeof import("./shipping-cost");
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    schema = await import("@/lib/schema");
    lib = await import("./shipping-cost");

    async function mkOrder(key: string, sourceName: string | null, isSample: boolean) {
      const [o] = await db
        .insert(schema.order)
        .values({
          shopifyId: `itest-sc-${RUN}-${key}`,
          sourceName,
          isSample,
          processedAt: D(Object.keys(ids).length + 1),
        })
        .returning({ id: schema.order.id });
      ids[key] = o.id;
      return o.id;
    }
    async function charge(orderId: string | null, cents: number, n = 1) {
      await db.insert(schema.shippingCharge).values({
        orderId,
        billNumber: `itest-sc-${RUN}`,
        orderName: `FBC-itest-${n}`,
        chargeCategory: "shipping_fee",
        amountCents: cents,
      });
    }

    const a = await mkOrder("A", "web", false); // d2c
    const b = await mkOrder("B", null, false); // d2c (legacy null)
    const c = await mkOrder("C", "shopify_draft_order", false); // b2b
    const d = await mkOrder("D", "pos", false); // tradeshow
    const e = await mkOrder("E", "web", true); // sample
    await mkOrder("F", "web", false); // d2c but NO charges → excluded

    await charge(a, 500);
    await charge(a, 300); // A has two charges → one order, summed to 800
    await charge(b, 1000);
    await charge(c, 5000);
    await charge(d, 200);
    await charge(e, 100);
  });

  afterAll(async () => {
    if (noDb) return;
    const orderIds = Object.values(ids);
    await db
      .delete(schema.shippingCharge)
      .where(inArray(schema.shippingCharge.orderId, orderIds));
    await db.delete(schema.order).where(inArray(schema.order.id, orderIds));
  });

  it("groups shipping cost by channel with per-order sums (not fanned out)", async () => {
    const rows = await lib.getShippingCostByChannel({ from: FROM, to: TO });
    const by = Object.fromEntries(rows.map((r) => [r.channel, r]));

    // D2C: orders A (500+300=800) + B (1000) = 2 orders, $18.00, avg $9.00
    expect(by.d2c).toMatchObject({ orders: 2, totalCents: 1800, avgCentsPerOrder: 900 });
    // B2B: order C only
    expect(by.b2b).toMatchObject({ orders: 1, totalCents: 5000, avgCentsPerOrder: 5000 });
    // Trade show: order D
    expect(by.tradeshow).toMatchObject({ orders: 1, totalCents: 200 });
    // Sample takes precedence over source_name=web
    expect(by.sample).toMatchObject({ orders: 1, totalCents: 100 });
    // Order F (no charges) contributes nothing — d2c order count stays 2.
  });

  it("returns per-order totals for a given set of ids", async () => {
    const map = await lib.getShippingCostByOrderIds([ids.A, ids.B, ids.F]);
    expect(map.get(ids.A)).toBe(800); // two charges summed
    expect(map.get(ids.B)).toBe(1000);
    expect(map.has(ids.F)).toBe(false); // no charges
  });
});
