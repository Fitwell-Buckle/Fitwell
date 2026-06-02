import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { company, customer, lead } from "@/lib/schema";

export const runtime = "nodejs";

const bodySchema = z.object({
  kind: z.enum(["lead", "customer"]),
  entityId: z.string().min(1),
  action: z.enum(["add", "remove", "make_primary"]),
});

// Attach/detach a person (a lead or a Shopify customer) to/from this B2B
// company, or designate them Primary Contact. Add sets their company_id; remove
// clears it (and clears the company's primary pointer if it was them);
// make_primary points the company at them.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let input;
  try {
    input = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  const exists = await db
    .select({ id: company.id })
    .from(company)
    .where(eq(company.id, id));
  if (exists.length === 0) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  try {
    if (input.action === "make_primary") {
      await db
        .update(company)
        .set({
          primaryContactKind: input.kind,
          primaryContactId: input.entityId,
        })
        .where(eq(company.id, id));
      return NextResponse.json({ data: { ok: true } });
    }

    const newCompanyId = input.action === "add" ? id : null;
    if (input.kind === "lead") {
      await db
        .update(lead)
        .set({ companyId: newCompanyId })
        .where(eq(lead.id, input.entityId));
    } else {
      await db
        .update(customer)
        .set({ companyId: newCompanyId })
        .where(eq(customer.id, input.entityId));
    }

    // Detaching the current primary clears the company's pointer.
    if (input.action === "remove") {
      const [c] = await db
        .select({
          kind: company.primaryContactKind,
          pid: company.primaryContactId,
        })
        .from(company)
        .where(eq(company.id, id));
      if (c && c.kind === input.kind && c.pid === input.entityId) {
        await db
          .update(company)
          .set({ primaryContactKind: null, primaryContactId: null })
          .where(eq(company.id, id));
      }
    }
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("Update company people failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
