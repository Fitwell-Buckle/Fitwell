import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { creator } from "@/lib/schema";
import { CREATOR_STATUSES, VETTING_STATUSES } from "@/lib/creators/list";
import { OFFER_TIERS, TAX_FORM_STATUSES } from "@/lib/creators/commission";

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
    phone: z.string().max(50).nullable().optional(),
    notes: z.string().max(10_000).nullable().optional(),
    offerTier: z.enum(OFFER_TIERS).nullable().optional(),
    commissionRatePct: z.number().min(0).max(100).nullable().optional(),
    payoutEmail: z.string().email().max(200).nullable().optional(),
    taxFormStatus: z.enum(TAX_FORM_STATUSES).optional(),
    // "Pass for now": true stamps parkedAt=now, false clears it (+ the reason).
    parked: z.boolean().optional(),
    parkedReason: z.string().max(500).nullable().optional(),
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
  if (parsed.data.phone !== undefined)
    updates.phone = parsed.data.phone?.trim() || null;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
  if (parsed.data.offerTier !== undefined)
    updates.offerTier = parsed.data.offerTier;
  if (parsed.data.commissionRatePct !== undefined)
    updates.commissionRatePct = parsed.data.commissionRatePct;
  if (parsed.data.payoutEmail !== undefined)
    updates.payoutEmail = parsed.data.payoutEmail?.trim() || null;
  if (parsed.data.taxFormStatus !== undefined)
    updates.taxFormStatus = parsed.data.taxFormStatus;
  if (parsed.data.parked !== undefined) {
    updates.parkedAt = parsed.data.parked ? new Date() : null;
    // Unparking clears the reason too, so a stale note can't linger.
    if (!parsed.data.parked) updates.parkedReason = null;
  }
  if (parsed.data.parkedReason !== undefined)
    updates.parkedReason = parsed.data.parkedReason?.trim() || null;

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
