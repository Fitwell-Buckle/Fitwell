import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { creator, creatorAsset } from "@/lib/schema";
import {
  ASSET_TYPES,
  RIGHTS_TIERS,
  rightsExpiresAt,
} from "@/lib/creators/assets";

// Middleware gates /api/admin/*; auth() here is for uploadedBy attribution.

const createSchema = z.object({
  storageUrl: z.string().url().max(2000),
  assetType: z.enum(ASSET_TYPES).default("edited"),
  rightsTier: z.enum(RIGHTS_TIERS).default("organic_only"),
  usageNotes: z.string().max(5000).nullish(),
  giftOrderId: z.string().nullish(),
  /** Defaults to now; YYYY-MM-DD when the asset arrived earlier. */
  receivedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

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

  const exists = await db.query.creator.findFirst({
    where: eq(creator.id, id),
    columns: { id: true },
  });
  if (!exists) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const session = await auth();
  const receivedAt = parsed.data.receivedAt
    ? new Date(parsed.data.receivedAt)
    : new Date();

  const [row] = await db
    .insert(creatorAsset)
    .values({
      creatorId: id,
      giftOrderId: parsed.data.giftOrderId ?? null,
      receivedAt,
      storageUrl: parsed.data.storageUrl,
      assetType: parsed.data.assetType,
      rightsTier: parsed.data.rightsTier,
      rightsExpiresAt: rightsExpiresAt(parsed.data.rightsTier, receivedAt),
      usageNotes: parsed.data.usageNotes ?? null,
      uploadedBy: session?.user?.email ?? null,
    })
    .returning({ id: creatorAsset.id });

  return NextResponse.json({ data: { id: row.id } });
}

const deleteSchema = z.object({ assetId: z.string().min(1) });

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = deleteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "assetId required" }, { status: 400 });
  }
  const deleted = await db
    .delete(creatorAsset)
    .where(
      and(eq(creatorAsset.id, parsed.data.assetId), eq(creatorAsset.creatorId, id)),
    )
    .returning({ id: creatorAsset.id });
  if (deleted.length === 0) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  return NextResponse.json({ data: { id: parsed.data.assetId } });
}
