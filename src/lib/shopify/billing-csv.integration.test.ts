import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import type { ParsedShippingCharge } from "@/lib/shopify/billing-csv";

// Real-Postgres behavior. Runs only when TEST_DATABASE_URL points at a dedicated
// Neon dev branch (see src/test-setup/integration-env.ts); otherwise skipped.
const noDb = !process.env.TEST_DATABASE_URL;

const RUN = Date.now();
// Two unique order numbers well above the live sequence to avoid collisions.
const NUM_A = 900000000 + (RUN % 10000);
const NUM_B = NUM_A + 1;
const BILL_1 = `itest-bill-1-${RUN}`;
const BILL_2 = `itest-bill-2-${RUN}`;

function charge(over: Partial<ParsedShippingCharge>): ParsedShippingCharge {
  return {
    billNumber: BILL_1,
    orderName: `FBC${NUM_A}`,
    orderNumber: NUM_A,
    chargeCategory: "shipping_fee",
    description: "Ground Advantage to Somewhere, USA",
    service: "Ground Advantage",
    destination: "Somewhere, USA",
    amountCents: 552,
    currency: "USD",
    chargedAt: new Date("2026-02-13"),
    ...over,
  };
}

describe.skipIf(noDb)("importShippingCharges (real DB)", () => {
  let db: typeof import("@/lib/db").db;
  let schema: typeof import("@/lib/schema");
  let importShippingCharges: typeof import("./billing-csv").importShippingCharges;
  let orderIdA: string;

  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    schema = await import("@/lib/schema");
    ({ importShippingCharges } = await import("./billing-csv"));

    // One matchable order (NUM_A exists); NUM_B intentionally has no order.
    const [o] = await db
      .insert(schema.order)
      .values({ shopifyId: `itest-ship-order-${RUN}`, shopifyOrderNumber: NUM_A })
      .returning({ id: schema.order.id });
    orderIdA = o.id;
  });

  afterAll(async () => {
    if (noDb) return;
    await db
      .delete(schema.shippingCharge)
      .where(inArray(schema.shippingCharge.billNumber, [BILL_1, BILL_2]));
    await db
      .delete(schema.order)
      .where(inArray(schema.order.shopifyOrderNumber, [NUM_A, NUM_B]));
  });

  it("matches charges to orders and records unmatched ones with a null orderId", async () => {
    const r = await importShippingCharges([
      charge({ amountCents: 552 }),
      charge({ amountCents: 495, description: "First Class Mail to X" }), // 2nd label, same order
      charge({ orderName: `FBC${NUM_B}`, orderNumber: NUM_B, amountCents: 1935 }), // no order
    ]);

    expect(r.totalCharges).toBe(3);
    expect(r.matchedCharges).toBe(2);
    expect(r.unmatchedCharges).toBe(1);
    expect(r.totalCents).toBe(552 + 495 + 1935);
    expect(r.matchedCents).toBe(552 + 495);
    expect(r.unmatchedOrderNames).toEqual([`FBC${NUM_B}`]);

    const rows = await db
      .select()
      .from(schema.shippingCharge)
      .where(eq(schema.shippingCharge.billNumber, BILL_1));
    expect(rows).toHaveLength(3);
    // The matched order's two charges carry the resolved orderId.
    const matched = rows.filter((x) => x.orderId === orderIdA);
    expect(matched).toHaveLength(2);
    expect(matched.reduce((s, x) => s + x.amountCents, 0)).toBe(552 + 495);
    // The unmatched charge is still stored, orderId null.
    expect(rows.find((x) => x.orderName === `FBC${NUM_B}`)?.orderId).toBeNull();
  });

  it("is idempotent per bill — re-import replaces, never double-counts", async () => {
    const charges = [charge({ amountCents: 552 }), charge({ amountCents: 495 })];
    await importShippingCharges(charges);
    await importShippingCharges(charges); // run again

    const rows = await db
      .select()
      .from(schema.shippingCharge)
      .where(eq(schema.shippingCharge.billNumber, BILL_1));
    expect(rows).toHaveLength(2); // replaced, not 4
    expect(rows.reduce((s, x) => s + x.amountCents, 0)).toBe(552 + 495);
  });

  it("only replaces the bills present in the import (other bills untouched)", async () => {
    await importShippingCharges([charge({ billNumber: BILL_1, amountCents: 552 })]);
    await importShippingCharges([charge({ billNumber: BILL_2, amountCents: 700 })]);

    // Re-importing only BILL_1 must leave BILL_2's row in place.
    await importShippingCharges([charge({ billNumber: BILL_1, amountCents: 999 })]);

    const b1 = await db
      .select()
      .from(schema.shippingCharge)
      .where(eq(schema.shippingCharge.billNumber, BILL_1));
    const b2 = await db
      .select()
      .from(schema.shippingCharge)
      .where(eq(schema.shippingCharge.billNumber, BILL_2));
    expect(b1).toHaveLength(1);
    expect(b1[0].amountCents).toBe(999);
    expect(b2).toHaveLength(1); // untouched
    expect(b2[0].amountCents).toBe(700);
  });
});
