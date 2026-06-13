import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { creatorPlatform } from "@/lib/schema";
import { normalizeHandle } from "@/lib/creators/scoring";
import { handleTaken, persistRollups } from "@/lib/creators/rescore";

// Middleware gates /api/admin/* to signed-in non-portal users.

const patchSchema = z
  .object({
    platform: z.enum(["ig", "yt", "tt"]).optional(),
    handle: z.string().min(1).max(200).optional(),
    profileUrl: z.string().url().max(2000).nullable().optional().or(z.literal("")),
    externalUrl: z.string().url().max(2000).nullable().optional().or(z.literal("")),
    bio: z.string().max(10_000).nullable().optional(),
    isVerified: z.boolean().nullable().optional(),
    isBusinessAccount: z.boolean().nullable().optional(),
    country: z
      .string()
      .regex(/^[A-Za-z]{2}$/, "expected a 2-letter country code")
      .nullable()
      .optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "Empty patch" });

async function load(id: string, platformId: string) {
  const [row] = await db
    .select()
    .from(creatorPlatform)
    .where(
      and(eq(creatorPlatform.id, platformId), eq(creatorPlatform.creatorId, id)),
    );
  return row ?? null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; platformId: string }> },
) {
  const { id, platformId } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }
  const row = await load(id, platformId);
  if (!row) {
    return NextResponse.json({ error: "Platform not found" }, { status: 404 });
  }

  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  if (d.platform !== undefined) updates.platform = d.platform;
  if (d.handle !== undefined) updates.handle = normalizeHandle(d.handle);
  if (d.profileUrl !== undefined) updates.profileUrl = d.profileUrl || null;
  if (d.externalUrl !== undefined) updates.externalUrl = d.externalUrl || null;
  if (d.bio !== undefined) updates.bio = d.bio;
  if (d.isVerified !== undefined) updates.isVerified = d.isVerified;
  if (d.isBusinessAccount !== undefined)
    updates.isBusinessAccount = d.isBusinessAccount;
  if (d.country !== undefined)
    updates.country = d.country?.toUpperCase() ?? null;

  // Uniqueness guard when platform/handle change.
  const nextPlatform = (updates.platform as string) ?? row.platform;
  const nextHandle = (updates.handle as string) ?? row.handle;
  if (
    (updates.platform !== undefined || updates.handle !== undefined) &&
    (await handleTaken(nextPlatform, nextHandle, platformId))
  ) {
    return NextResponse.json(
      { error: `@${nextHandle} on ${nextPlatform} is already tracked` },
      { status: 409 },
    );
  }

  await db
    .update(creatorPlatform)
    .set(updates)
    .where(eq(creatorPlatform.id, platformId));

  // Primary platform may flip if the platform kind changed.
  if (updates.platform !== undefined) await persistRollups(id);

  return NextResponse.json({ data: { id: platformId } });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; platformId: string }> },
) {
  const { id, platformId } = await params;
  const row = await load(id, platformId);
  if (!row) {
    return NextResponse.json({ error: "Platform not found" }, { status: 404 });
  }
  // Cascades to creator_stats_daily + creator_post via FK onDelete.
  await db.delete(creatorPlatform).where(eq(creatorPlatform.id, platformId));
  await persistRollups(id);
  return NextResponse.json({ data: { id: platformId } });
}
