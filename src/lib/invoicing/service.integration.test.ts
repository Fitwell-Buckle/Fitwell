import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";

// createInvoiceFromPo (one per company, retail−tier) and createPoFromInvoice
// against real Postgres. Runs only with TEST_DATABASE_URL; otherwise skipped.
const noDb = !process.env.TEST_DATABASE_URL;
const RUN = Date.now();

describe.skipIf(noDb)("invoice service (real DB)", () => {
  let db: typeof import("@/lib/db").db;
  let schema: typeof import("@/lib/schema");
  let inv: typeof import("./service");
  let prod: typeof import("@/lib/production/service");

  let supplierId: string;
  let tierId: string;
  let companyA: string;
  let companyB: string;
  let poId: string;

  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    schema = await import("@/lib/schema");
    inv = await import("./service");
    prod = await import("@/lib/production/service");

    const [tier] = await db
      .insert(schema.priceTier)
      .values({ name: `t-${RUN}`, discountPercent: 30 })
      .returning({ id: schema.priceTier.id });
    tierId = tier.id;

    const [a] = await db
      .insert(schema.company)
      .values({ name: `itest-A-${RUN}`, priceTierId: tierId, contactEmail: "a@co.test" })
      .returning({ id: schema.company.id });
    const [b] = await db
      .insert(schema.company)
      .values({ name: `itest-B-${RUN}` })
      .returning({ id: schema.company.id });
    companyA = a.id;
    companyB = b.id;

    const [s] = await db
      .insert(schema.supplier)
      .values({ name: `itest-inv-sup-${RUN}` })
      .returning({ id: schema.supplier.id });
    supplierId = s.id;

    // PO defaults to company A; one line overrides to company B.
    const created = await prod.createPo({
      supplierId,
      issuedDate: "2026-05-01",
      companyId: companyA,
      lineItems: [
        { sku: "A1", title: "Buckle A", quantity: 10, shopifyVariantId: "v1" },
        { sku: "B1", title: "Buckle B", quantity: 4, shopifyVariantId: "v2", companyId: companyB },
      ],
    });
    poId = created.poId;
  });

  afterAll(async () => {
    if (noDb) return;
    await db.delete(schema.invoice).where(inArray(schema.invoice.companyId, [companyA, companyB]));
    const pos = await db
      .select({ id: schema.productionPo.id })
      .from(schema.productionPo)
      .where(eq(schema.productionPo.supplierId, supplierId));
    for (const po of pos) {
      await db.delete(schema.productionPo).where(eq(schema.productionPo.id, po.id));
    }
    await db.delete(schema.company).where(inArray(schema.company.id, [companyA, companyB]));
    await db.delete(schema.priceTier).where(eq(schema.priceTier.id, tierId));
    await db.delete(schema.supplier).where(eq(schema.supplier.id, supplierId));
  });

  it("creates one invoice per company, priced at retail minus the tier", async () => {
    const retail = new Map([
      ["v1", 5000],
      ["v2", 2500],
    ]);
    const result = await inv.createInvoiceFromPo(poId, retail);
    expect(result.invoices).toHaveLength(2);
    expect(result.unassignedCount).toBe(0);

    const aInv = result.invoices.find((i) => i.companyId === companyA)!;
    const bInv = result.invoices.find((i) => i.companyId === companyB)!;

    const a = await inv.getInvoiceDetail(aInv.id);
    expect(a!.lineItems).toHaveLength(1);
    expect(a!.subtotalCents).toBe(50000); // 10 × 5000
    expect(a!.discountPercent).toBe(30);
    expect(a!.discountCents).toBe(15000);
    expect(a!.totalCents).toBe(35000);
    expect(a!.sourcePoId).toBe(poId);
    expect(a!.invoiceNumber).toMatch(/^INV-\d{5,}$/);

    const b = await inv.getInvoiceDetail(bInv.id);
    expect(b!.subtotalCents).toBe(10000); // 4 × 2500
    expect(b!.discountCents).toBe(0); // no tier
    expect(b!.totalCents).toBe(10000);
  });

  it("creates a draft PO from an invoice, carrying lines + company", async () => {
    const retail = new Map([["v1", 5000]]);
    // A fresh single-company invoice to turn back into a PO.
    const made = await inv.createInvoice({
      companyId: companyA,
      issuedDate: "2026-05-02",
      lineItems: [
        { sku: "A1", title: "Buckle A", quantity: 7, unitPriceCents: 5000, shopifyVariantId: "v1" },
      ],
    });
    void retail;

    const { poId: newPoId } = await inv.createPoFromInvoice(made.id, supplierId);
    const po = await prod.getPoDetail(newPoId);
    expect(po!.companyId).toBe(companyA);
    expect(po!.lineItems).toHaveLength(1);
    expect(po!.lineItems[0].sku).toBe("A1");
    expect(po!.lineItems[0].quantity).toBe(7);
    expect(po!.notes).toContain(made.invoiceNumber);
  });
});
