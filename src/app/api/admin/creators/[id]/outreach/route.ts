import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { creator, creatorOutreach, creatorOutreachEvent } from "@/lib/schema";
import {
  nextFollowupAt,
  OUTREACH_CHANNELS,
  OUTREACH_STATUSES,
} from "@/lib/creators/lifecycle";

// Middleware gates /api/admin/*; auth() here is for createdBy attribution.

const createSchema = z.object({
  channel: z.enum(OUTREACH_CHANNELS),
  status: z.enum(OUTREACH_STATUSES).default("no_reply"),
  terms: z.string().max(5000).nullish(),
  /** The first touch, logged as the thread's opening event. */
  note: z.string().max(10_000).min(1),
});

/** Start an outreach thread (one per channel per conversation). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const record = await db.query.creator.findFirst({
    where: eq(creator.id, id),
    columns: { id: true, status: true },
  });
  if (!record) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const session = await auth();
  const now = new Date();

  const [thread] = await db
    .insert(creatorOutreach)
    .values({
      creatorId: id,
      channel: parsed.data.channel,
      status: parsed.data.status,
      terms: parsed.data.terms ?? null,
      firstContactAt: now,
      lastContactAt: now,
      nextFollowupAt: nextFollowupAt(parsed.data.status, now),
    })
    .returning({ id: creatorOutreach.id });

  await db.insert(creatorOutreachEvent).values({
    outreachId: thread.id,
    direction: "out",
    summary: parsed.data.note,
    createdBy: session?.user?.email ?? null,
  });

  // First outreach moves a prospect into "contacted".
  if (record.status === "prospect") {
    await db
      .update(creator)
      .set({ status: "contacted", updatedAt: now })
      .where(eq(creator.id, id));
  }

  return NextResponse.json({ data: { id: thread.id } });
}
