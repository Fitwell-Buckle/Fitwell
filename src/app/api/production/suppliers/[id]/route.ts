import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supplier } from "@/lib/schema";
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
