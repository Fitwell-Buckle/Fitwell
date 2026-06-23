import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

// Supplier lead-service against real Postgres. Runs only when
// TEST_DATABASE_URL is set; otherwise self-skips. Covers the triage rating
// (star value + temperature) carried from the booth onto the supplier-leads
// list, including sort-by-rating.
const noDb = !process.env.TEST_DATABASE_URL;
const RUN = Date.now();

describe.skipIf(noDb)("supplier leads list — triage rating", () => {
  let db: typeof import("@/lib/db").db;
  let schema: typeof import("@/lib/schema");
  let svc: typeof import("./lead-service");

  let userId: string;
  let showId: string;
  const leadIds: string[] = [];
  const token = `suptriage-${RUN}`;

  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    schema = await import("@/lib/schema");
    svc = await import("./lead-service");

    const [u] = await db
      .insert(schema.user)
      .values({
        name: `itest-suptriage-${RUN}`,
        email: `suptriage-${RUN}@itest.local`,
      })
      .returning({ id: schema.user.id });
    userId = u.id;

    const [show] = await db
      .insert(schema.tradeShow)
      .values({ name: `itest-sup-show-${RUN}` })
      .returning({ id: schema.tradeShow.id });
    showId = show.id;
  });

  afterAll(async () => {
    if (noDb) return;
    // Cascades the vendor rows, clearing supplier_lead_id before we drop leads.
    await db.delete(schema.tradeShow).where(eq(schema.tradeShow.id, showId));
    if (leadIds.length) {
      await db
        .delete(schema.supplierLead)
        .where(inArray(schema.supplierLead.id, leadIds));
    }
    await db.delete(schema.user).where(eq(schema.user.id, userId));
  });

  it("surfaces the linked vendor's star value + temperature, sorts by rating", async () => {
    const mk = (firstName: string, company: string) =>
      svc.createSupplierLead(
        { firstName, companyName: `${company} ${token}` },
        { capturedByUserId: userId },
      );
    const { id: hi } = await mk("Hi", "Acme");
    const { id: lo } = await mk("Lo", "Beta");
    const { id: none } = await mk("None", "Gamma");
    leadIds.push(hi, lo, none);

    await db.insert(schema.tradeShowVendor).values([
      {
        tradeShowId: showId,
        companyName: `Acme ${token}`,
        supplierLeadId: hi,
        leadValue: 5,
        followUpTemp: "hot",
      },
      {
        tradeShowId: showId,
        companyName: `Beta ${token}`,
        supplierLeadId: lo,
        leadValue: 2,
        followUpTemp: "cold",
      },
    ]);

    const ranked = (
      await svc.listSupplierLeads({ search: token, sort: "rating" })
    ).filter((r) => leadIds.includes(r.id));
    // Highest star value first; the unrated lead sorts last.
    expect(ranked.map((r) => r.id)).toEqual([hi, lo, none]);

    const hiRow = ranked.find((r) => r.id === hi);
    expect(hiRow?.leadValue).toBe(5);
    expect(hiRow?.followUpTemp).toBe("hot");

    const noneRow = ranked.find((r) => r.id === none);
    expect(noneRow?.leadValue).toBeNull();
    expect(noneRow?.followUpTemp).toBeNull();
  });
});
