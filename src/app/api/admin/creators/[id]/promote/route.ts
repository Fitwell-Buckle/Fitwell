import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { creator, influencer } from "@/lib/schema";

// Middleware gates /api/admin/* to signed-in non-portal users.

const PLATFORM_NAMES: Record<string, string> = {
  ig: "instagram",
  yt: "youtube",
  tt: "tiktok",
};

/**
 * Ensure this creator has a linked influencer row so the existing gifting
 * flow (influencer_order + Shopify $0 draft order) can serve them — the
 * unified system's "send sample" promotion. Idempotent: returns the
 * existing link when there is one. The influencer row is bridge
 * infrastructure until the contract migration retires the table.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const record = await db.query.creator.findFirst({
    where: eq(creator.id, id),
    with: {
      platforms: { columns: { platform: true, handle: true } },
      emails: { columns: { email: true, kind: true } },
    },
  });
  if (!record) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const existing = await db.query.influencer.findFirst({
    where: eq(influencer.creatorId, id),
    columns: { id: true },
  });
  if (existing) {
    return NextResponse.json({ data: { influencerId: existing.id } });
  }

  const primary =
    record.platforms.find((p) => p.platform === record.primaryPlatform) ??
    record.platforms[0];
  const bestEmail =
    record.emails.find((e) => e.kind === "business")?.email ??
    record.emails[0]?.email ??
    null;

  const [row] = await db
    .insert(influencer)
    .values({
      name: record.name,
      handle: primary ? `@${primary.handle}` : null,
      platform: primary ? (PLATFORM_NAMES[primary.platform] ?? primary.platform) : null,
      contactEmail: bestEmail,
      customerId: record.customerId,
      assignedCollectionIds: record.assignedCollectionIds ?? [],
      creatorId: id,
    })
    .returning({ id: influencer.id });

  // Promotion implies the relationship went live.
  if (record.status === "prospect" || record.status === "contacted") {
    await db
      .update(creator)
      .set({ status: "agreed", updatedAt: new Date() })
      .where(eq(creator.id, id));
  }

  return NextResponse.json({ data: { influencerId: row.id } });
}
