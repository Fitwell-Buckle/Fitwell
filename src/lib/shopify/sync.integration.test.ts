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
});
