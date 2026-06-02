import { NextResponse } from "next/server";
import { z } from "zod";
import { count, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  company,
  customer,
  customerMessage,
  invoice,
  lead,
  productionPo,
  productionPoLineItem,
} from "@/lib/schema";
import {
  detectCompanyConflict,
  companyConflictMessage,
} from "@/lib/b2b/company-conflict";
import { companySchema } from "../_schema";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let input;
  try {
    input = companySchema.partial().parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  if (Object.keys(input).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  if (input.name !== undefined || input.contactEmail !== undefined) {
    const existing = await db
      .select({
        id: company.id,
        name: company.name,
        contactEmail: company.contactEmail,
      })
      .from(company);
    const conflict = detectCompanyConflict(
      { name: input.name, contactEmail: input.contactEmail || null },
      existing,
      id,
    );
    if (conflict) {
      const value = conflict === "name" ? input.name ?? "" : input.contactEmail ?? "";
      return NextResponse.json(
        { error: companyConflictMessage(conflict, value) },
        { status: 409 },
      );
    }
  }

  try {
    const [updated] = await db
      .update(company)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.contactName !== undefined
          ? { contactName: input.contactName || null }
          : {}),
        ...(input.contactEmail !== undefined
          ? { contactEmail: input.contactEmail || null }
          : {}),
        ...(input.address !== undefined
          ? { address: input.address || null }
          : {}),
        ...(input.customerId !== undefined
          ? { customerId: input.customerId || null }
          : {}),
        ...(input.priceTierId !== undefined
          ? { priceTierId: input.priceTierId || null }
          : {}),
        ...(input.assignedCollectionIds !== undefined
          ? { assignedCollectionIds: input.assignedCollectionIds ?? [] }
          : {}),
        ...(input.assignedProductIds !== undefined
          ? { assignedProductIds: input.assignedProductIds ?? [] }
          : {}),
        ...(input.depositPercent !== undefined
          ? { depositPercent: input.depositPercent ?? 0 }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(company.id, id))
      .returning({ id: company.id });

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: updated.id } });
  } catch (err) {
    console.error("Update company failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Delete a B2B customer (company). Blocked when it has financial records
// (invoices or purchase orders) — those must be handled first so we never
// orphan real transactions. Otherwise unlinks soft references (converted leads,
// detected customer messages) and deletes; company_contact rows cascade.
export async function DELETE(
  _req: Request,
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

  try {
    const [invoices, pos] = await Promise.all([
      db
        .select({ n: count() })
        .from(invoice)
        .where(eq(invoice.companyId, id)),
      db
        .select({ n: count() })
        .from(productionPo)
        .where(eq(productionPo.companyId, id)),
    ]);
    const invoiceCount = invoices[0]?.n ?? 0;
    const poCount = pos[0]?.n ?? 0;
    if (invoiceCount > 0 || poCount > 0) {
      const parts = [
        invoiceCount > 0 && `${invoiceCount} invoice${invoiceCount === 1 ? "" : "s"}`,
        poCount > 0 && `${poCount} purchase order${poCount === 1 ? "" : "s"}`,
      ].filter(Boolean);
      return NextResponse.json(
        {
          error: `Can't delete this customer — it still has ${parts.join(" and ")}. Delete or reassign those first.`,
        },
        { status: 409 },
      );
    }

    // Unlink every soft reference into this company so the FK delete succeeds,
    // then delete it (company_contact rows cascade). These are all the
    // non-financial tables that point at company.id: attached leads + Shopify
    // customers (the "People" list), detected customer messages, and per-line
    // company overrides on PO line items (which can point here even when the PO
    // belongs to someone else, so the PO guard above wouldn't catch them).
    await db.update(lead).set({ companyId: null }).where(eq(lead.companyId, id));
    await db
      .update(customer)
      .set({ companyId: null })
      .where(eq(customer.companyId, id));
    await db
      .update(customerMessage)
      .set({ companyId: null })
      .where(eq(customerMessage.companyId, id));
    await db
      .update(productionPoLineItem)
      .set({ companyId: null })
      .where(eq(productionPoLineItem.companyId, id));
    const [deleted] = await db
      .delete(company)
      .where(eq(company.id, id))
      .returning({ id: company.id });
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: deleted.id } });
  } catch (err) {
    console.error("Delete company failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
