import { NextResponse } from "next/server";
import { z } from "zod";
import { count, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  customerMessage,
  productionPo,
  supplier,
  whatsappMessage,
} from "@/lib/schema";
import { supplierSchema } from "../_schema";

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
    input = supplierSchema.partial().parse(await req.json());
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

  try {
    const [updated] = await db
      .update(supplier)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.contactName !== undefined
          ? { contactName: input.contactName || null }
          : {}),
        ...(input.contactEmail !== undefined
          ? { contactEmail: input.contactEmail || null }
          : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.shippingAddress !== undefined
          ? { shippingAddress: input.shippingAddress || null }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(supplier.id, id))
      .returning({ id: supplier.id });

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: updated.id } });
  } catch (err) {
    console.error("Update supplier failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Delete a supplier. Blocked while it still has purchase orders (a PO's
// supplier is NOT NULL — those must be deleted/reassigned first). Otherwise
// unlinks soft references (detected customer/WhatsApp messages) and deletes;
// supplier_contact, line costs, stage assignments, outbound + sent emails all
// cascade. Mirrors the company delete.
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
    const [pos] = await db
      .select({ n: count() })
      .from(productionPo)
      .where(eq(productionPo.supplierId, id));
    const poCount = pos?.n ?? 0;
    if (poCount > 0) {
      return NextResponse.json(
        {
          error: `Can't delete this supplier — it still has ${poCount} purchase order${poCount === 1 ? "" : "s"}. Delete or reassign those first.`,
        },
        { status: 409 },
      );
    }

    // Unlink nullable soft references (no cascade) so the FK delete succeeds.
    await db
      .update(customerMessage)
      .set({ supplierId: null })
      .where(eq(customerMessage.supplierId, id));
    await db
      .update(whatsappMessage)
      .set({ supplierId: null })
      .where(eq(whatsappMessage.supplierId, id));

    const [deleted] = await db
      .delete(supplier)
      .where(eq(supplier.id, id))
      .returning({ id: supplier.id });
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: deleted.id } });
  } catch (err) {
    console.error("Delete supplier failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
