import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { creator, creatorEmail } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { classifyEmailKind } from "@/lib/creators/scoring";

// Middleware gates /api/admin/* to signed-in non-portal users.

const postSchema = z.object({
  email: z.string().email().max(200),
  kind: z.enum(["business", "personal", "manager"]).nullish(),
  portalAccess: z.boolean().optional(),
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

  const email = parsed.data.email.toLowerCase();
  try {
    const [row] = await db
      .insert(creatorEmail)
      .values({
        creatorId: id,
        email,
        kind: parsed.data.kind ?? classifyEmailKind(email),
        source: "manual",
        portalAccess: parsed.data.portalAccess ?? false,
      })
      .returning({ id: creatorEmail.id });
    return NextResponse.json({ data: { id: row.id } });
  } catch {
    // Unique (creator_id, email) — already on file.
    return NextResponse.json(
      { error: "That email is already on this creator" },
      { status: 409 },
    );
  }
}
