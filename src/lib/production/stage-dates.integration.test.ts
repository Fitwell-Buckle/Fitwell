import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, asc } from "drizzle-orm";

// updateStageEventDate against real Postgres: editing a stage's date moves its
// entered_at and syncs the previous stage's exited_at, and out-of-order dates
// are rejected. Runs only with TEST_DATABASE_URL; otherwise skipped.
const noDb = !process.env.TEST_DATABASE_URL;
const RUN = Date.now();

describe.skipIf(noDb)("updateStageEventDate (real DB)", () => {
  let db: typeof import("@/lib/db").db;
  let schema: typeof import("@/lib/schema");
  let svc: typeof import("./service");
  let supplierId: string;
  let poId: string;
  let lineItemId: string;

  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    schema = await import("@/lib/schema");
    svc = await import("./service");

    const [s] = await db
      .insert(schema.supplier)
      .values({ name: `itest-sdate-${RUN}` })
      .returning({ id: schema.supplier.id });
    supplierId = s.id;

    const created = await svc.createPo({
      supplierId,
      issuedDate: "2026-05-01",
      lineItems: [{ sku: "A", title: "Buckle A", quantity: 1 }],
    });
    poId = created.poId;

    // Advance twice → chain of 3 events: supplier_po, stamping, edm.
    await svc.advance({ poId });
    await svc.advance({ poId });

    const detail = await svc.getPoDetail(poId);
    lineItemId = detail!.lineItems[0].id;

    // advance() stamps every event at "now"; spread them onto distinct days so
    // there's room to move the middle one without violating the order bounds.
    const events = await chain();
    const days = ["2026-05-08", "2026-05-10", "2026-05-12"];
    for (let i = 0; i < events.length && i < days.length; i++) {
      await db
        .update(schema.productionStageEvent)
        .set({ enteredAt: new Date(`${days[i]}T12:00:00Z`) })
        .where(eq(schema.productionStageEvent.id, events[i].id));
    }
  });

  afterAll(async () => {
    if (noDb) return;
    await db.delete(schema.productionPo).where(eq(schema.productionPo.id, poId));
    await db.delete(schema.supplier).where(eq(schema.supplier.id, supplierId));
  });

  async function chain() {
    return db
      .select({
        id: schema.productionStageEvent.id,
        stage: schema.productionStageEvent.stage,
        enteredAt: schema.productionStageEvent.enteredAt,
        exitedAt: schema.productionStageEvent.exitedAt,
      })
      .from(schema.productionStageEvent)
      .where(eq(schema.productionStageEvent.lineItemId, lineItemId))
      .orderBy(asc(schema.productionStageEvent.enteredAt));
  }

  it("moves entered_at and syncs the previous stage's exited_at", async () => {
    const before = await chain();
    const middle = before[1]; // stamping (05-10), between 05-08 and 05-12

    const res = await svc.updateStageEventDate(middle.id, "2026-05-11");
    expect(res.ok).toBe(true);

    const after = await chain();
    const newMiddle = after.find((e) => e.id === middle.id)!;
    const prev = after.find((e) => e.id === before[0].id)!;

    expect(newMiddle.enteredAt.toISOString().slice(0, 10)).toBe("2026-05-11");
    // Previous event's exit == this event's new entry (same transition).
    expect(prev.exitedAt?.getTime()).toBe(newMiddle.enteredAt.getTime());
  });

  it("rejects a date after the next stage (out of order)", async () => {
    const c = await chain();
    const first = c[0]; // supplier_po; next is stamping (now 2026-05-15)
    const res = await svc.updateStageEventDate(first.id, "2026-06-01");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown event", async () => {
    const res = await svc.updateStageEventDate("does-not-exist", "2026-05-10");
    expect(res).toMatchObject({ ok: false, status: 404 });
  });
});
