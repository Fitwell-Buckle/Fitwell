import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { creator, creatorOutreach, creatorOutreachEvent } from "@/lib/schema";
import {
  nextFollowupAt,
  OUTREACH_STATUSES,
} from "@/lib/creators/lifecycle";

// Middleware gates /api/admin/*; auth() here is for createdBy attribution.

const eventSchema = z.object({
  direction: z.enum(["out", "in", "note"]).default("note"),
  summary: z.string().min(1).max(10_000),
  body: z.string().max(50_000).nullish(),
  /** Optionally move the thread's status in the same action. */
  status: z.enum(OUTREACH_STATUSES).optional(),
});

/** Log an event on a thread (and optionally transition its status). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ outreachId: string }> },
) {
  const { outreachId } = await params;
  const parsed = eventSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const thread = await db.query.creatorOutreach.findFirst({
    where: eq(creatorOutreach.id, outreachId),
    columns: { id: true, creatorId: true, status: true },
  });
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const session = await auth();
  const now = new Date();

  await db.insert(creatorOutreachEvent).values({
    outreachId,
    direction: parsed.data.direction,
    summary: parsed.data.summary,
    body: parsed.data.body ?? null,
    createdBy: session?.user?.email ?? null,
  });

  const updates: Record<string, unknown> = { updatedAt: now };
  // Real touches (not internal notes) bump the contact clock.
  if (parsed.data.direction !== "note") updates.lastContactAt = now;

  const newStatus = parsed.data.status;
  if (newStatus && newStatus !== thread.status) {
    updates.status = newStatus;
    updates.nextFollowupAt = nextFollowupAt(newStatus, now);
    await db.insert(creatorOutreachEvent).values({
      outreachId,
      direction: "status",
      summary: `Status: ${thread.status} → ${newStatus}`,
      createdBy: session?.user?.email ?? null,
    });
    // Outreach agreement promotes the creator relationship.
    if (newStatus === "agreed") {
      await db
        .update(creator)
        .set({ status: "agreed", updatedAt: now })
        .where(eq(creator.id, thread.creatorId));
    }
  } else if (parsed.data.direction !== "note") {
    // A reply/new touch without explicit status keeps the cadence alive.
    updates.nextFollowupAt = nextFollowupAt(
      parsed.data.direction === "in" ? "replied" : thread.status,
      now,
    );
  }

  await db
    .update(creatorOutreach)
    .set(updates)
    .where(eq(creatorOutreach.id, outreachId));

  return NextResponse.json({ data: { id: outreachId } });
}

const patchSchema = z
  .object({
    status: z.enum(OUTREACH_STATUSES).optional(),
    terms: z.string().max(5000).nullable().optional(),
    nextFollowupAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "Empty patch" });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ outreachId: string }> },
) {
  const { outreachId } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.status !== undefined) {
    updates.status = parsed.data.status;
    updates.nextFollowupAt = nextFollowupAt(parsed.data.status);
  }
  if (parsed.data.terms !== undefined) updates.terms = parsed.data.terms;
  if (parsed.data.nextFollowupAt !== undefined) {
    updates.nextFollowupAt = parsed.data.nextFollowupAt
      ? new Date(parsed.data.nextFollowupAt)
      : null;
  }

  const updated = await db
    .update(creatorOutreach)
    .set(updates)
    .where(eq(creatorOutreach.id, outreachId))
    .returning({ id: creatorOutreach.id });

  if (updated.length === 0) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json({ data: { id: outreachId } });
}
