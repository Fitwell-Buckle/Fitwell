import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { company, companyContact, creator, customer } from "@/lib/schema";
import { createLead } from "@/lib/crm/service";
import { LEAD_PERSONA_TAGS } from "@/lib/crm/constants";
import { attachPrimaryContactByEmail } from "@/lib/b2b/attach-contact";
import { splitName } from "@/lib/creators/edit";

// Reclassify a creator that's really a B2B prospect (e.g. a strap brand
// surfaced by follower count) or just a retail customer. Creates/links the
// target record, stamps the provenance FK on the creator, and archives it
// with a backlink note. Idempotent: a creator already converted to a given
// target returns the existing id rather than creating a duplicate.

const bodySchema = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("lead"),
    personaTag: z.enum(LEAD_PERSONA_TAGS).nullish(),
    companyName: z.string().max(200).nullish(),
  }),
  z.object({
    target: z.literal("company"),
    companyName: z.string().max(200).nullish(),
  }),
  z.object({
    target: z.literal("customer"),
    // Link an existing Shopify customer; omit to create a manual one.
    customerId: z.string().min(1).nullish(),
  }),
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const record = await db.query.creator.findFirst({
    where: (c, { eq: eqOp }) => eqOp(c.id, id),
    with: { emails: { columns: { email: true, kind: true } } },
  });
  if (!record) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const bestEmail =
    record.emails.find((e) => e.kind === "business")?.email ??
    record.emails[0]?.email ??
    null;
  const { firstName, lastName } = splitName(record.name);
  const today = new Date().toISOString().slice(0, 10);

  // Append a backlink to the creator's notes without clobbering them.
  function noteWith(line: string): string {
    return [record!.notes, line].filter(Boolean).join("\n");
  }

  // ── B2B lead ──────────────────────────────────────────────────────
  if (parsed.data.target === "lead") {
    if (record.leadId) {
      return NextResponse.json({ data: { target: "lead", id: record.leadId } });
    }
    const { id: leadId } = await createLead(
      {
        firstName,
        lastName,
        email: bestEmail,
        companyName: parsed.data.companyName ?? record.name,
        personaTag: parsed.data.personaTag ?? null,
        sourceChannel: "b2b_creator_pipeline",
        country: record.country,
        notes: `Reclassified from creator "${record.name}" (creator id ${record.id}).`,
      },
      { capturedByUserId: session.user.id },
    );
    await db
      .update(creator)
      .set({
        leadId,
        status: "archived",
        notes: noteWith(`→ Converted to B2B lead ${today}.`),
        updatedAt: new Date(),
      })
      .where(eq(creator.id, id));
    return NextResponse.json({ data: { target: "lead", id: leadId } });
  }

  // ── B2B company ───────────────────────────────────────────────────
  if (parsed.data.target === "company") {
    if (record.companyId) {
      return NextResponse.json({
        data: { target: "company", id: record.companyId },
      });
    }
    const name = parsed.data.companyName?.trim() || record.name;
    const [created] = await db
      .insert(company)
      .values({
        name,
        contactName: record.name,
        contactEmail: bestEmail,
        customerId: record.customerId,
        notes: `Reclassified from creator "${record.name}" (creator id ${record.id}).`,
      })
      .returning({ id: company.id });

    // Best-effort: attach the contact as primary + grant portal login,
    // mirroring POST /api/production/companies. Never blocks the convert.
    if (bestEmail) {
      try {
        await attachPrimaryContactByEmail(created.id, bestEmail);
        await db
          .insert(companyContact)
          .values({
            companyId: created.id,
            email: bestEmail.toLowerCase(),
            name: record.name,
          })
          .onConflictDoNothing({ target: companyContact.email });
      } catch (err) {
        console.error("convert→company contact attach failed:", err);
      }
    }

    await db
      .update(creator)
      .set({
        companyId: created.id,
        status: "archived",
        notes: noteWith(`→ Converted to B2B company ${today}.`),
        updatedAt: new Date(),
      })
      .where(eq(creator.id, id));
    return NextResponse.json({ data: { target: "company", id: created.id } });
  }

  // ── Customer (link existing or create manual) ─────────────────────
  if (record.customerId) {
    // Already linked (gifting recipient or a prior convert) — just archive.
    await db
      .update(creator)
      .set({
        status: "archived",
        notes: noteWith(`→ Reclassified as customer ${today}.`),
        updatedAt: new Date(),
      })
      .where(eq(creator.id, id));
    return NextResponse.json({
      data: { target: "customer", id: record.customerId },
    });
  }

  let customerId = parsed.data.customerId ?? null;
  if (customerId) {
    const [found] = await db
      .select({ id: customer.id })
      .from(customer)
      .where(eq(customer.id, customerId));
    if (!found) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }
  } else {
    // Manual customer — no Shopify id (shopify_id is nullable/unique).
    const [made] = await db
      .insert(customer)
      .values({ email: bestEmail, firstName, lastName })
      .returning({ id: customer.id });
    customerId = made.id;
  }

  await db
    .update(creator)
    .set({
      customerId,
      status: "archived",
      notes: noteWith(`→ Reclassified as customer ${today}.`),
      updatedAt: new Date(),
    })
    .where(eq(creator.id, id));
  return NextResponse.json({ data: { target: "customer", id: customerId } });
}
