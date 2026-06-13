import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { creator } from "@/lib/schema";
import { CREATOR_STATUSES, VETTING_STATUSES } from "@/lib/creators/list";

// Middleware already gates /api/admin/* to signed-in non-portal users.

const patchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    primaryPlatform: z.enum(["ig", "yt", "tt"]).nullable().optional(),
    status: z.enum(CREATOR_STATUSES).optional(),
    vettingStatus: z.enum(VETTING_STATUSES).optional(),
    scoreBoost: z.number().min(-100).max(100).optional(),
    country: z
      .string()
      .regex(/^[A-Za-z]{2}$/, "expected a 2-letter country code")
      .nullable()
      .optional(),
    notes: z.string().max(10_000).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "Empty patch" });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.primaryPlatform !== undefined)
    updates.primaryPlatform = parsed.data.primaryPlatform;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.vettingStatus !== undefined)
    updates.vettingStatus = parsed.data.vettingStatus;
  if (parsed.data.scoreBoost !== undefined)
    updates.scoreBoost = parsed.data.scoreBoost;
  if (parsed.data.country !== undefined)
    updates.country = parsed.data.country?.toUpperCase() ?? null;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;

  // Burned creators get a 12-month cool-off (creator-program.md Phase 3 rule).
  if (parsed.data.status === "burned") {
    const until = new Date();
    until.setMonth(until.getMonth() + 12);
    updates.burnedUntilDate = until.toISOString().slice(0, 10);
  }

  const updated = await db
    .update(creator)
    .set(updates)
    .where(eq(creator.id, id))
    .returning({ id: creator.id });

  if (updated.length === 0) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }
  return NextResponse.json({ data: { id: updated[0].id } });
}
