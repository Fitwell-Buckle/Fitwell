import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { creatorEmail } from "@/lib/schema";

// Middleware gates /api/admin/* to signed-in non-portal users.

const patchSchema = z
  .object({
    email: z.string().email().max(200).optional(),
    kind: z.enum(["business", "personal", "manager"]).nullable().optional(),
    portalAccess: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "Empty patch" });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> },
) {
  const { id, emailId } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }
  const updates: Record<string, unknown> = {};
  if (parsed.data.email !== undefined)
    updates.email = parsed.data.email.toLowerCase();
  if (parsed.data.kind !== undefined) updates.kind = parsed.data.kind;
  if (parsed.data.portalAccess !== undefined)
    updates.portalAccess = parsed.data.portalAccess;

  const updated = await db
    .update(creatorEmail)
    .set(updates)
    .where(and(eq(creatorEmail.id, emailId), eq(creatorEmail.creatorId, id)))
    .returning({ id: creatorEmail.id });
  if (updated.length === 0) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }
  return NextResponse.json({ data: { id: updated[0].id } });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> },
) {
  const { id, emailId } = await params;
  const deleted = await db
    .delete(creatorEmail)
    .where(and(eq(creatorEmail.id, emailId), eq(creatorEmail.creatorId, id)))
    .returning({ id: creatorEmail.id });
  if (deleted.length === 0) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }
  return NextResponse.json({ data: { id: deleted[0].id } });
}
