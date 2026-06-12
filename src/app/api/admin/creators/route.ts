import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { creator, creatorEmail, creatorPlatform } from "@/lib/schema";
import { classifyEmailKind, normalizeHandle } from "@/lib/creators/scoring";

// Middleware gates /api/admin/* to signed-in non-portal users.

const createSchema = z.object({
  name: z.string().min(1).max(200),
  platform: z.enum(["ig", "yt", "tt"]),
  handle: z.string().min(1).max(200),
  profileUrl: z.string().url().max(2000).nullish().or(z.literal("")),
  email: z.string().email().max(200).nullish().or(z.literal("")),
  notes: z.string().max(10_000).nullish(),
});

/**
 * Manually add a creator (found outside the research dataset / discovery
 * crons). Manually added creators are auto-approved — a human just chose
 * to add them, which is the vetting. 409 if the handle is already
 * tracked (including rejected ones, so dumped creators don't sneak back).
 */
export async function POST(req: Request) {
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const handle = normalizeHandle(input.handle);

  const existing = await db
    .select({ creatorId: creatorPlatform.creatorId })
    .from(creatorPlatform)
    .where(
      and(
        eq(creatorPlatform.platform, input.platform),
        eq(creatorPlatform.handle, handle),
      ),
    );
  if (existing.length > 0) {
    return NextResponse.json(
      { error: "Already tracked", data: { id: existing[0].creatorId } },
      { status: 409 },
    );
  }

  const [row] = await db
    .insert(creator)
    .values({
      name: input.name,
      primaryPlatform: input.platform,
      status: "prospect",
      vettingStatus: "approved",
      notes: input.notes || null,
    })
    .returning({ id: creator.id });

  await db.insert(creatorPlatform).values({
    creatorId: row.id,
    platform: input.platform,
    handle,
    profileUrl: input.profileUrl || null,
    dataSource: "manual",
  });

  if (input.email) {
    await db.insert(creatorEmail).values({
      creatorId: row.id,
      email: input.email.toLowerCase(),
      kind: classifyEmailKind(input.email),
      source: "manual",
    });
  }

  return NextResponse.json({ data: { id: row.id } });
}
