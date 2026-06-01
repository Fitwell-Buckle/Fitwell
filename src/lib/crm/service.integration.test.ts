import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

// CRM service (createLead/listLeads/updateLead/dropLead, matching, cards)
// against real Postgres. Runs only when TEST_DATABASE_URL is set; otherwise
// self-skips.
const noDb = !process.env.TEST_DATABASE_URL;
const RUN = Date.now();

describe.skipIf(noDb)("crm service (real DB)", () => {
  let db: typeof import("@/lib/db").db;
  let schema: typeof import("@/lib/schema");
  let svc: typeof import("./service");

  let userId: string;
  const leadIds: string[] = [];

  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    schema = await import("@/lib/schema");
    svc = await import("./service");

    const [u] = await db
      .insert(schema.user)
      .values({ name: `itest-crm-user-${RUN}`, email: `crm-${RUN}@itest.local` })
      .returning({ id: schema.user.id });
    userId = u.id;
  });

  afterAll(async () => {
    if (noDb) return;
    if (leadIds.length) {
      await db.delete(schema.lead).where(inArray(schema.lead.id, leadIds));
    }
    await db.delete(schema.user).where(eq(schema.user.id, userId));
  });

  it("creates a lead, defaults stage and owner, and getLead reads it back", async () => {
    const { id } = await svc.createLead(
      {
        firstName: "Ada",
        email: "ada@itest.local",
        sourceChannel: "b2b_trade_shows_consumer",
      },
      { capturedByUserId: userId },
    );
    leadIds.push(id);

    const row = await svc.getLead(id);
    expect(row).toMatchObject({
      id,
      stage: "prospect",
      status: "active",
      sourceChannel: "b2b_trade_shows_consumer",
      ownerUserId: userId,
      capturedByUserId: userId,
    });
  });

  it("createLeadSchema rejects a row with no identity fields", () => {
    const result = svc.createLeadSchema.safeParse({
      sourceChannel: "b2b_outbound_cold",
    });
    expect(result.success).toBe(false);
  });

  it("filters leads by status (default active hides dropped)", async () => {
    const { id: keep } = await svc.createLead(
      { firstName: "Keep", sourceChannel: "b2b_outbound_cold" },
      { capturedByUserId: userId },
    );
    const { id: drop } = await svc.createLead(
      { firstName: "Drop", sourceChannel: "b2b_outbound_cold" },
      { capturedByUserId: userId },
    );
    leadIds.push(keep, drop);

    await svc.dropLead(drop);

    const active = await svc.listLeads({ sourceChannel: "b2b_outbound_cold" });
    const ids = active.map((r) => r.id);
    expect(ids).toContain(keep);
    expect(ids).not.toContain(drop);

    const dropped = await svc.listLeads({
      sourceChannel: "b2b_outbound_cold",
      status: "dropped",
    });
    expect(dropped.map((r) => r.id)).toContain(drop);
  });

  it("search filter matches name / company / email substring (case-insensitive)", async () => {
    const { id } = await svc.createLead(
      {
        firstName: "Grace",
        lastName: "Hopper",
        companyName: "COBOL Inc",
        email: "grace@itest.local",
        sourceChannel: "b2b_inbound",
      },
      { capturedByUserId: userId },
    );
    leadIds.push(id);

    const byName = await svc.listLeads({ search: "grac" });
    const byCompany = await svc.listLeads({ search: "cobol" });
    const byEmail = await svc.listLeads({ search: "GRACE@ITEST" });
    expect(byName.map((r) => r.id)).toContain(id);
    expect(byCompany.map((r) => r.id)).toContain(id);
    expect(byEmail.map((r) => r.id)).toContain(id);
  });

  it("updateLead patches selected fields and bumps updatedAt", async () => {
    const { id } = await svc.createLead(
      { firstName: "Pre", sourceChannel: "b2b_outbound_cold" },
      { capturedByUserId: userId },
    );
    leadIds.push(id);
    const before = await svc.getLead(id);
    expect(before?.stage).toBe("prospect");
    // ensure measurable updatedAt delta
    await new Promise((r) => setTimeout(r, 10));

    const result = await svc.updateLead(id, {
      stage: "lead",
      personaTag: "watch_oem",
      notes: "warm — wants samples",
    });
    expect(result?.id).toBe(id);

    const after = await svc.getLead(id);
    expect(after?.stage).toBe("lead");
    expect(after?.personaTag).toBe("watch_oem");
    expect(after?.notes).toBe("warm — wants samples");
    expect(after?.updatedAt && before?.updatedAt
      ? after.updatedAt.getTime() > before.updatedAt.getTime()
      : false,
    ).toBe(true);
  });

  it("updateLead returns null for an unknown id", async () => {
    const ghost = await svc.updateLead("non-existent-id", { stage: "lead" });
    expect(ghost).toBeNull();
  });

  it("dropLead is a soft-delete (row stays, status becomes 'dropped')", async () => {
    const { id } = await svc.createLead(
      { firstName: "Soft", sourceChannel: "b2b_outbound_cold" },
      { capturedByUserId: userId },
    );
    leadIds.push(id);

    await svc.dropLead(id);
    const after = await svc.getLead(id);
    expect(after?.status).toBe("dropped");
  });

  it("matchByEmail returns the company that owns the email's domain", async () => {
    const [co] = await db
      .insert(schema.company)
      .values({
        name: `itest-acme-${RUN}`,
        contactEmail: `ceo@acme-${RUN}.test`,
      })
      .returning({ id: schema.company.id });

    const match = await svc.matchByEmail(`new-contact@acme-${RUN}.test`);
    expect(match.matchedCompany?.id).toBe(co.id);
    expect(match.matchedDomain).toBe(`acme-${RUN}.test`);

    await db.delete(schema.company).where(eq(schema.company.id, co.id));
  });

  it("matchByEmail skips free-email domains for company matching", async () => {
    const match = await svc.matchByEmail("personal@gmail.com");
    expect(match.matchedCompany).toBeNull();
    expect(match.matchedDomain).toBeNull();
  });

  it("matchByEmail surfaces an existing active lead in the matched company", async () => {
    const [co] = await db
      .insert(schema.company)
      .values({
        name: `itest-widgets-${RUN}`,
        contactEmail: `info@widgets-${RUN}.test`,
      })
      .returning({ id: schema.company.id });
    const sharedEmail = `alice@widgets-${RUN}.test`;
    const { id } = await svc.createLead(
      {
        firstName: "Alice",
        email: sharedEmail,
        sourceChannel: "b2b_inbound",
        companyId: co.id,
      },
      { capturedByUserId: userId },
    );
    leadIds.push(id);

    const match = await svc.matchByEmail(sharedEmail);
    expect(match.matchedCompany?.id).toBe(co.id);
    expect(match.matchedLead?.id).toBe(id);

    await db.delete(schema.company).where(eq(schema.company.id, co.id));
  });

  it("addLeadCardImage records history and bumps lead.cardImageUrl to the latest", async () => {
    const { id } = await svc.createLead(
      {
        firstName: "Cards",
        sourceChannel: "b2b_inbound",
        cardImageUrl: "https://blob.example/leads/cards/first.jpg",
      },
      { capturedByUserId: userId },
    );
    leadIds.push(id);

    // createLead with a cardImageUrl auto-inserts one row.
    const first = await svc.listLeadCardImages(id);
    expect(first.length).toBe(1);

    await svc.addLeadCardImage({
      leadId: id,
      blobUrl: "https://blob.example/leads/cards/second.jpg",
    });

    const both = await svc.listLeadCardImages(id);
    expect(both.length).toBe(2);

    const after = await svc.getLead(id);
    expect(after?.cardImageUrl).toBe(
      "https://blob.example/leads/cards/second.jpg",
    );
  });

  it("outbound messages: create, list draft queue, edit, mark sent", async () => {
    const msgs = await import("./messages");
    const { id: leadId } = await svc.createLead(
      { firstName: "Msg", email: "msg@itest.local", sourceChannel: "b2b_inbound" },
      { capturedByUserId: userId },
    );
    leadIds.push(leadId);

    const { id: msgId } = await msgs.createOutboundMessage({
      leadId,
      toEmail: "msg@itest.local",
      subject: "Following up",
      body: "Hi Msg, great to meet you.",
      generatedByModel: "claude-sonnet-4-5",
      createdByUserId: userId,
    });

    // Appears in the default (draft) queue, joined with the lead name.
    const queue = await msgs.listOutboundMessages();
    const mine = queue.find((m) => m.id === msgId);
    expect(mine).toBeTruthy();
    expect(mine?.leadFirstName).toBe("Msg");
    expect(mine?.status).toBe("draft");

    // Edit the body.
    await msgs.updateOutboundMessage(msgId, { body: "Edited body" });

    // Mark sent → leaves the draft queue and stamps sentAt.
    await msgs.updateOutboundMessage(msgId, { status: "sent" });
    const stillDraft = await msgs.listOutboundMessages();
    expect(stillDraft.find((m) => m.id === msgId)).toBeUndefined();
    const sent = await msgs.listOutboundMessages({ status: "sent" });
    const sentMsg = sent.find((m) => m.id === msgId);
    expect(sentMsg?.body).toBe("Edited body");
    expect(sentMsg?.sentAt).toBeTruthy();
  });
});
