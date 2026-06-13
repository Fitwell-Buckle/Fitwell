import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { creator, creatorPlatform } from "@/lib/schema";
import { deriveNameFromHandle } from "@/lib/creators/edit";
import { persistRollups } from "@/lib/creators/rescore";

// Middleware gates /api/admin/* to signed-in non-portal users.

// Omit targetCreatorId → split the platform onto a brand-new creator.
// Provide one → reassign the platform onto that existing creator.
const bodySchema = z.object({
  targetCreatorId: z.string().min(1).nullish(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; platformId: string }> },
) {
  const { id, platformId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(creatorPlatform)
    .where(
      and(eq(creatorPlatform.id, platformId), eq(creatorPlatform.creatorId, id)),
    );
  if (!row) {
    return NextResponse.json({ error: "Platform not found" }, { status: 404 });
  }

  let destId = parsed.data.targetCreatorId ?? null;

  if (destId) {
    // Reassign to an existing creator.
    if (destId === id) {
      return NextResponse.json(
        { error: "Platform already belongs to this creator" },
        { status: 400 },
      );
    }
    const [target] = await db
      .select({ id: creator.id })
      .from(creator)
      .where(eq(creator.id, destId));
    if (!target) {
      return NextResponse.json(
        { error: "Target creator not found" },
        { status: 404 },
      );
    }
  } else {
    // Split: mint a new standalone creator that owns just this platform.
    const [created] = await db
      .insert(creator)
      .values({
        name: deriveNameFromHandle(row.handle, row.platform),
        primaryPlatform: row.platform,
        status: "prospect",
        // A freshly separated entity is unvetted — surfaces in the to-vet queue.
        vettingStatus: "unreviewed",
        country: row.country,
      })
      .returning({ id: creator.id });
    destId = created.id;
  }

  await db
    .update(creatorPlatform)
    .set({ creatorId: destId })
    .where(eq(creatorPlatform.id, platformId));

  // Both sides changed shape: source lost a platform, dest gained one.
  await Promise.all([persistRollups(id), persistRollups(destId)]);

  return NextResponse.json({
    data: { platformId, creatorId: destId, split: !parsed.data.targetCreatorId },
  });
}
