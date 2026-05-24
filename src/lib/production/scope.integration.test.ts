import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

// Cross-supplier isolation against real Postgres. Runs only when
// TEST_DATABASE_URL points at a dedicated Neon dev branch; otherwise skipped so
// CI and the prod DB are never touched.
const noDb = !process.env.TEST_DATABASE_URL;

const RUN = Date.now();

describe.skipIf(noDb)("supplier scope isolation (real DB)", () => {
  let db: typeof import("@/lib/db").db;
  let schema: typeof import("@/lib/schema");
  let svc: typeof import("./service");
  let scope: typeof import("./scope");

  let supplierA: string;
  let supplierB: string;
  let poA: string;
  let lineItemA: string;

  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    schema = await import("@/lib/schema");
    svc = await import("./service");
    scope = await import("./scope");

    const [a] = await db
      .insert(schema.supplier)
      .values({ name: `itest-supplierA-${RUN}` })
      .returning({ id: schema.supplier.id });
    const [b] = await db
      .insert(schema.supplier)
      .values({ name: `itest-supplierB-${RUN}` })
      .returning({ id: schema.supplier.id });
    supplierA = a.id;
    supplierB = b.id;

    const created = await svc.createPo({
      supplierId: supplierA,
      shopifyPoNumber: `PO-scope-${RUN}`,
      issuedDate: "2026-05-01",
      lineItems: [{ sku: "A", title: "Buckle A", quantity: 1 }],
    });
    poA = created.poId;
    const detail = await svc.getPoDetail(poA);
    lineItemA = detail!.lineItems[0].id;
  });

  afterAll(async () => {
    if (noDb) return;
    for (const sid of [supplierA, supplierB]) {
      const pos = await db
        .select({ id: schema.productionPo.id })
        .from(schema.productionPo)
        .where(eq(schema.productionPo.supplierId, sid));
      for (const po of pos) {
        await db.delete(schema.productionPo).where(eq(schema.productionPo.id, po.id));
      }
      await db.delete(schema.supplier).where(eq(schema.supplier.id, sid));
    }
  });

  it("resolves the owning supplier of a PO and a line item", async () => {
    expect(await scope.poSupplierId(poA)).toBe(supplierA);
    expect(await scope.lineItemPoSupplierId(lineItemA)).toBe(supplierA);
  });

  it("lets supplier A act on their own PO", async () => {
    const session = { user: { id: "uA", role: "supplier", supplierId: supplierA } };
    expect(await scope.ensureSupplierMayActOnPo(session, poA)).toBeNull();
    expect(await scope.ensureSupplierMayActOnLineItem(session, lineItemA)).toBeNull();
  });

  it("forbids supplier B from acting on supplier A's PO", async () => {
    const session = { user: { id: "uB", role: "supplier", supplierId: supplierB } };
    expect(await scope.ensureSupplierMayActOnPo(session, poA)).toEqual({
      error: "Forbidden",
      status: 403,
    });
    expect(await scope.ensureSupplierMayActOnLineItem(session, lineItemA)).toEqual({
      error: "Forbidden",
      status: 403,
    });
  });

  it("lets an admin (non-supplier) act on any PO", async () => {
    const admin = { user: { id: "admin", role: "user", supplierId: null } };
    expect(await scope.ensureSupplierMayActOnPo(admin, poA)).toBeNull();
    expect(await scope.ensureSupplierMayActOnLineItem(admin, lineItemA)).toBeNull();
  });

  it("rejects a missing session", async () => {
    expect(await scope.ensureSupplierMayActOnPo(null, poA)).toEqual({
      error: "Unauthorized",
      status: 401,
    });
  });
});
