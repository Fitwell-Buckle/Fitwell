import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { creator, creatorPlatform } from "@/lib/schema";
import { normalizeHandle } from "@/lib/creators/scoring";
import { handleTaken, persistRollups } from "@/lib/creators/rescore";
import { populatePlatform } from "@/lib/creators/populate";

// Middleware gates /api/admin/* to signed-in non-portal users.
// Add a channel (platform) to an existing creator, then auto-populate it
// from the platform API (YT / IG). TikTok and missing-key cases create the
// row and defer population to the nightly cron.

const postSchema = z.object({
  platform: z.enum(["ig", "yt", "tt"]),
  handle: z.string().min(1).max(200),
  profileUrl: z.string().url().max(2000).nullish().or(z.literal("")),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const [exists] = await db
    .select({ id: creator.id })
    .from(creator)
    .where(eq(creator.id, id));
  if (!exists) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const handle = normalizeHandle(parsed.data.handle);
  if (await handleTaken(parsed.data.platform, handle)) {
    return NextResponse.json(
      { error: `@${handle} on ${parsed.data.platform} is already tracked` },
      { status: 409 },
    );
  }

  const [row] = await db
    .insert(creatorPlatform)
    .values({
      creatorId: id,
      platform: parsed.data.platform,
      handle,
      profileUrl: parsed.data.profileUrl || null,
      dataSource: "manual",
    })
    .returning({ id: creatorPlatform.id });

  // Pull stats + recent posts now if the API key is available; otherwise
  // the row is live and the nightly crons will fill it.
  const result = await populatePlatform(row.id);
  if (!result.populated) await persistRollups(id);

  return NextResponse.json({
    data: {
      id: row.id,
      populated: result.populated,
      reason: result.reason ?? null,
      followers: result.followers ?? null,
      newPosts: result.newPosts ?? 0,
    },
  });
}
