import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { creator, creatorPost } from "@/lib/schema";
import { mentionsFitwell } from "@/lib/creators/scoring";

// Middleware gates /api/admin/* to signed-in non-portal users.

const bodySchema = z.object({
  /** Which of the creator's platform records this post belongs to. */
  creatorPlatformId: z.string().min(1),
  postUrl: z.string().url().max(2000),
  postedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date")
    .nullish(),
  caption: z.string().max(10_000).nullish(),
  giftOrderId: z.string().nullish(),
});

/** Manual post entry (TikTok, or anything the pollers missed). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  // The platform record must belong to this creator (no cross-linking).
  const record = await db.query.creator.findFirst({
    where: eq(creator.id, id),
    with: { platforms: { columns: { id: true } } },
  });
  if (!record) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }
  if (!record.platforms.some((p) => p.id === parsed.data.creatorPlatformId)) {
    return NextResponse.json(
      { error: "Platform record does not belong to this creator" },
      { status: 400 },
    );
  }

  const [row] = await db
    .insert(creatorPost)
    .values({
      creatorPlatformId: parsed.data.creatorPlatformId,
      postUrl: parsed.data.postUrl,
      postedAt: parsed.data.postedAt ? new Date(parsed.data.postedAt) : null,
      caption: parsed.data.caption ?? null,
      giftOrderId: parsed.data.giftOrderId ?? null,
      mentionedUs: mentionsFitwell(parsed.data.caption),
      source: "manual",
    })
    .onConflictDoNothing({ target: creatorPost.postUrl })
    .returning({ id: creatorPost.id });

  if (!row) {
    return NextResponse.json(
      { error: "That post URL is already tracked" },
      { status: 409 },
    );
  }
  return NextResponse.json({ data: { id: row.id } });
}
