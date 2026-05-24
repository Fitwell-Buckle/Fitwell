import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPo } from "@/lib/schema";
import {
  updatePoSchema,
  updatePoFull,
  updatePoFullSchema,
} from "@/lib/production/service";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Editing PO header/status is admin-only; suppliers can advance/comment/upload.
  if (session.user.role === "supplier") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let input;
  try {
    input = updatePoSchema.parse(await req.json());
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
      .update(productionPo)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(productionPo.id, id))
      .returning({ id: productionPo.id });

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: updated.id } });
  } catch (err) {
    console.error("Update production PO failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Full edit: replace header + reconcile line items (add/update/remove).
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Full edit is admin-only; suppliers can advance/comment/upload, not edit.
  if (session.user.role === "supplier") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let input;
  try {
    input = updatePoFullSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  try {
    const existing = await db
      .select({ id: productionPo.id })
      .from(productionPo)
      .where(eq(productionPo.id, id));
    if (existing.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await updatePoFull(id, input);
    return NextResponse.json({ data: { id: result.poId } });
  } catch (err) {
    console.error("Full PO edit failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
