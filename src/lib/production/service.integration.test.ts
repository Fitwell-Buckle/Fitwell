import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

// Real-Postgres create + advance behavior. Runs only when TEST_DATABASE_URL
// points at a dedicated Neon dev branch (see src/test-setup/integration-env.ts);
// otherwise the suite is skipped so CI and the prod DB are never touched.
const noDb = !process.env.TEST_DATABASE_URL;

const RUN = Date.now();
const supplierName = `itest-supplier-${RUN}`;

describe.skipIf(noDb)("production service (real DB)", () => {
  let db: typeof import("@/lib/db").db;
  let schema: typeof import("@/lib/schema");
  let svc: typeof import("./service");
  let supplierId: string;

  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    schema = await import("@/lib/schema");
    svc = await import("./service");

    const [s] = await db
      .insert(schema.supplier)
      .values({ name: supplierName })
      .returning({ id: schema.supplier.id });
    supplierId = s.id;
  });

  afterAll(async () => {
    if (noDb) return;
    // Deleting POs cascades to line items and stage events.
    const pos = await db
      .select({ id: schema.productionPo.id })
      .from(schema.productionPo)
      .where(eq(schema.productionPo.supplierId, supplierId));
    for (const po of pos) {
      await db.delete(schema.productionPo).where(eq(schema.productionPo.id, po.id));
    }
    await db.delete(schema.supplier).where(eq(schema.supplier.id, supplierId));
  });

  it("creates a PO with line items and seeds opening stage events", async () => {
    const { poId, poNumber } = await svc.createPo({
      supplierId,
      issuedDate: "2026-05-01",
      lineItems: [
        { sku: "A", title: "Buckle A", quantity: 10 },
        { sku: "B", title: "Buckle B", quantity: 5 },
      ],
    });

    // System-assigned, zero-padded to at least 5 digits (e.g. "00100").
    expect(poNumber).toMatch(/^\d{5,}$/);

    const po = await svc.getPoDetail(poId);
    expect(po!.shopifyPoNumber).toBe(poNumber);
    expect(po?.lineItems).toHaveLength(2);
    for (const li of po!.lineItems) {
      expect(li.currentStage).toBe("supplier_po");
      expect(li.stageEvents).toHaveLength(1);
      expect(li.stageEvents[0].stage).toBe("supplier_po");
    }
  });

  it("advances a locked PO: all line items move together", async () => {
    const { poId } = await svc.createPo({
      supplierId,
      issuedDate: "2026-05-01",
      lineItems: [
        { sku: "A", title: "Buckle A", quantity: 1 },
        { sku: "B", title: "Buckle B", quantity: 1 },
      ],
    });

    const transitions = await svc.advance({ poId });
    expect(transitions).toHaveLength(2);
    expect(transitions.every((t) => t.to === "stamping")).toBe(true);

    const po = await svc.getPoDetail(poId);
    for (const li of po!.lineItems) {
      expect(li.currentStage).toBe("stamping");
      // opening supplier_po (now closed) + new stamping event
      expect(li.stageEvents).toHaveLength(2);
      const opening = li.stageEvents.find((e) => e.stage === "supplier_po");
      expect(opening?.exitedAt).toBeInstanceOf(Date);
    }
  });

  it("advances only the targeted item once the PO is broken", async () => {
    const { poId } = await svc.createPo({
      supplierId,
      issuedDate: "2026-05-01",
      lineItems: [
        { sku: "A", title: "Buckle A", quantity: 1 },
        { sku: "B", title: "Buckle B", quantity: 1 },
      ],
    });

    await db
      .update(schema.productionPo)
      .set({ lockStagesTogether: false })
      .where(eq(schema.productionPo.id, poId));

    const before = await svc.getPoDetail(poId);
    const targetId = before!.lineItems[0].id;

    const transitions = await svc.advance({ poId, lineItemId: targetId });
    expect(transitions).toHaveLength(1);
    expect(transitions[0].lineItemId).toBe(targetId);

    const after = await svc.getPoDetail(poId);
    const target = after!.lineItems.find((li) => li.id === targetId)!;
    const other = after!.lineItems.find((li) => li.id !== targetId)!;
    expect(target.currentStage).toBe("stamping");
    expect(other.currentStage).toBe("supplier_po");
  });

  it("full edit reconciles line items: update, add, remove", async () => {
    const { poId } = await svc.createPo({
      supplierId,
      issuedDate: "2026-05-01",
      lineItems: [
        { sku: "KEEP", title: "Keep me", quantity: 1 },
        { sku: "DROP", title: "Drop me", quantity: 1 },
      ],
    });

    const before = await svc.getPoDetail(poId);
    const keepId = before!.lineItems.find((li) => li.sku === "KEEP")!.id;
    const originalNumber = before!.shopifyPoNumber; // system-assigned, immutable

    // Advance the kept line so we can verify its stage survives the edit.
    await svc.advance({ poId, lineItemId: keepId });

    await svc.updatePoFull(poId, {
      supplierId,
      issuedDate: "2026-05-02",
      expectedDeliveryDate: null,
      notes: "edited",
      lineItems: [
        // keep + update qty/cost (no id change → stage preserved)
        { id: keepId, sku: "KEEP", title: "Keep me", quantity: 9, unitCostCents: 1500 },
        // new line (no id) → inserted with an opening stage event
        { sku: "NEW", title: "New line", quantity: 2 },
        // DROP omitted → deleted
      ],
    });

    const after = await svc.getPoDetail(poId);
    expect(after!.shopifyPoNumber).toBe(originalNumber); // immutable across edits
    expect(after!.notes).toBe("edited");
    expect(after!.lineItems).toHaveLength(2);

    const keep = after!.lineItems.find((li) => li.sku === "KEEP")!;
    expect(keep.id).toBe(keepId); // same row
    expect(keep.quantity).toBe(9);
    expect(keep.unitCostCents).toBe(1500);
    expect(keep.currentStage).toBe("stamping"); // stage survived the edit

    const added = after!.lineItems.find((li) => li.sku === "NEW")!;
    expect(added.currentStage).toBe("supplier_po");
    expect(added.stageEvents).toHaveLength(1);

    expect(after!.lineItems.some((li) => li.sku === "DROP")).toBe(false);
  });
});
