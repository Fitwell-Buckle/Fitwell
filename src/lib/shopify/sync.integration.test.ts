import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import type { ShopifyCustomer, ShopifyOrder } from "@/types/shopify";

// Real-Postgres dedupe behavior. Runs only when TEST_DATABASE_URL points at a
// dedicated Neon dev branch (see src/test-setup/integration-env.ts); otherwise
// the whole suite is skipped so CI and the prod DB are never touched.
const noDb = !process.env.TEST_DATABASE_URL;

// Unique per run so a partial failure can never clobber real or prior rows.
const RUN = Date.now();
const custShopifyId = `itest-cust-${RUN}`;
const orderShopifyId = `itest-order-${RUN}`;

function makeCustomer(over: Partial<ShopifyCustomer> = {}): ShopifyCustomer {
  return {
    id: RUN,
    email: "itest@example.com",
    first_name: "I",
    last_name: "Test",
    phone: null,
    orders_count: 2,
    total_spent: "100.00",
    tags: "vip, beta",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe.skipIf(noDb)("shopify sync dedupe (real DB)", () => {
  let db: typeof import("@/lib/db").db;
  let schema: typeof import("@/lib/schema");
  let upsertCustomer: typeof import("./sync").upsertCustomer;
  let upsertOrder: typeof import("./sync").upsertOrder;

  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    schema = await import("@/lib/schema");
    ({ upsertCustomer, upsertOrder } = await import("./sync"));
  });

  afterAll(async () => {
    if (noDb) return;
    const ord = await db.query.order.findFirst({
      where: eq(schema.order.shopifyId, orderShopifyId),
    });
    if (ord) {
      await db
        .delete(schema.orderLineItem)
        .where(eq(schema.orderLineItem.orderId, ord.id));
    }
    const cust = await db.query.customer.findFirst({
      where: eq(schema.customer.shopifyId, custShopifyId),
    });
    if (cust) {
      await db
        .delete(schema.utmAttribution)
        .where(eq(schema.utmAttribution.visitorId, cust.id));
    }
    await db.delete(schema.order).where(eq(schema.order.shopifyId, orderShopifyId));
    await db
      .delete(schema.customer)
      .where(eq(schema.customer.shopifyId, custShopifyId));
  });

  it("upserts a customer idempotently on shopifyId", async () => {
    const sc = { ...makeCustomer(), id: Number(RUN) } as ShopifyCustomer;
    // Force a known shopifyId by stringifying our sentinel id.
    sc.id = custShopifyId as unknown as number;

    const id1 = await upsertCustomer(sc);
    const id2 = await upsertCustomer({ ...sc, email: "updated@example.com" });

    expect(id2).toBe(id1);

    const rows = await db
      .select()
      .from(schema.customer)
      .where(eq(schema.customer.shopifyId, custShopifyId));
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("updated@example.com");
  });

  it("preserves the first-touch firstOrderAt across re-syncs (COALESCE)", async () => {
    const sc = makeCustomer({ created_at: "2026-02-01T00:00:00.000Z" });
    sc.id = custShopifyId as unknown as number;

    // Conflict-path upsert sets firstOrderAt from this created_at.
    await upsertCustomer(sc);
    const after2 = await db.query.customer.findFirst({
      where: eq(schema.customer.shopifyId, custShopifyId),
    });
    const firstTouch = after2?.firstOrderAt;
    expect(firstTouch).toBeInstanceOf(Date);

    // A later re-sync with a newer created_at must NOT move firstOrderAt.
    await upsertCustomer(
      makeCustomer({
        created_at: "2026-09-09T00:00:00.000Z",
        orders_count: 9,
      }),
    );
    const after3 = await db.query.customer.findFirst({
      where: eq(schema.customer.shopifyId, custShopifyId),
    });
    expect(after3?.firstOrderAt?.getTime()).toBe(firstTouch?.getTime());
    expect(after3?.orderCount).toBe(9);
  });

  it("replaces (not duplicates) order line items on re-sync", async () => {
    const baseOrder: ShopifyOrder = {
      id: orderShopifyId as unknown as number,
      order_number: 1001,
      email: "itest@example.com",
      total_price: "100.00",
      subtotal_price: "100.00",
      total_discounts: "0.00",
      total_tax: "0.00",
      currency: "USD",
      financial_status: "paid",
      fulfillment_status: null,
      discount_codes: [],
      refunds: [],
      processed_at: "2026-03-01T00:00:00.000Z",
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
      customer: makeCustomer({ ...{} }),
      source_name: "web",
      landing_site: null,
      referring_site: null,
      note: null,
      note_attributes: [],
      tags: "",
      line_items: [
        {
          id: 1,
          product_id: 11,
          variant_id: 111,
          title: "Buckle A",
          variant_title: null,
          sku: "A",
          quantity: 1,
          price: "50.00",
        },
        {
          id: 2,
          product_id: 12,
          variant_id: 112,
          title: "Buckle B",
          variant_title: null,
          sku: "B",
          quantity: 1,
          price: "50.00",
        },
      ],
    };
    baseOrder.customer.id = custShopifyId as unknown as number;

    const oid1 = await upsertOrder(baseOrder);
    const oid2 = await upsertOrder({
      ...baseOrder,
      line_items: [baseOrder.line_items[0]],
    });

    expect(oid2).toBe(oid1);

    const orders = await db
      .select()
      .from(schema.order)
      .where(eq(schema.order.shopifyId, orderShopifyId));
    expect(orders).toHaveLength(1);

    const items = await db
      .select()
      .from(schema.orderLineItem)
      .where(eq(schema.orderLineItem.orderId, oid1));
    expect(items).toHaveLength(1); // replaced, not 3
  });

  it("inserts the order-derived UTM touch once, not on every re-sync", async () => {
    const utmOrder: ShopifyOrder = {
      id: orderShopifyId as unknown as number,
      order_number: 1001,
      email: "itest@example.com",
      total_price: "40.00",
      subtotal_price: "40.00",
      total_discounts: "0.00",
      total_tax: "0.00",
      currency: "USD",
      financial_status: "paid",
      fulfillment_status: null,
      discount_codes: [],
      refunds: [],
      processed_at: "2026-03-01T00:00:00.000Z",
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
      customer: makeCustomer(),
      source_name: "web",
      landing_site: "/?utm_source=itest&utm_medium=cpc",
      referring_site: null,
      note: null,
      note_attributes: [],
      tags: "",
      line_items: [],
    };
    utmOrder.customer.id = custShopifyId as unknown as number;

    await upsertOrder(utmOrder); // may be a re-sync if earlier tests created the order
    const cust = await db.query.customer.findFirst({
      where: eq(schema.customer.shopifyId, custShopifyId),
    });
    const countTouches = async () =>
      (
        await db
          .select()
          .from(schema.utmAttribution)
          .where(eq(schema.utmAttribution.visitorId, cust!.id))
      ).length;

    const after1 = await countTouches();
    await upsertOrder(utmOrder); // definite re-sync
    await upsertOrder(utmOrder); // and again
    expect(await countTouches()).toBe(after1); // no new rows on re-sync
  });

  it("replaces (not duplicates) discount-code rows on re-sync and normalizes casing", async () => {
    const baseOrder: ShopifyOrder = {
      id: orderShopifyId as unknown as number,
      order_number: 1001,
      email: "itest@example.com",
      total_price: "94.00",
      subtotal_price: "100.00",
      total_discounts: "6.00",
      total_tax: "0.00",
      currency: "USD",
      financial_status: "paid",
      fulfillment_status: null,
      discount_codes: [
        { code: "WatchBros15", amount: "6.00", type: "percentage" },
        { code: "JM-AB12CD3", amount: "0.00", type: "percentage" },
      ],
      refunds: [],
      processed_at: "2026-03-01T00:00:00.000Z",
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
      customer: makeCustomer(),
      source_name: "web",
      landing_site: null,
      referring_site: null,
      note: null,
      note_attributes: [],
      tags: "",
      line_items: [],
    };
    baseOrder.customer.id = custShopifyId as unknown as number;

    const oid1 = await upsertOrder(baseOrder);
    const rows1 = await db
      .select()
      .from(schema.orderDiscountCode)
      .where(eq(schema.orderDiscountCode.orderId, oid1));
    expect(rows1).toHaveLength(2);
    const watchbros = rows1.find((r) => r.code === "watchbros15");
    expect(watchbros).toBeDefined();
    expect(watchbros?.codeRaw).toBe("WatchBros15"); // raw casing preserved
    expect(watchbros?.amountCents).toBe(600);
    expect(watchbros?.type).toBe("percentage");

    // Re-sync with one code → replaced, not appended
    const oid2 = await upsertOrder({
      ...baseOrder,
      discount_codes: [{ code: "jm-ab12cd3", amount: "0.00", type: "percentage" }],
    });
    expect(oid2).toBe(oid1);
    const rows2 = await db
      .select()
      .from(schema.orderDiscountCode)
      .where(eq(schema.orderDiscountCode.orderId, oid1));
    expect(rows2).toHaveLength(1);
    expect(rows2[0].code).toBe("jm-ab12cd3");
  });
});
