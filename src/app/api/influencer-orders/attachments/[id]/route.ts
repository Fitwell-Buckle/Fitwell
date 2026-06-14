import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { influencerOrderAttachment } from "@/lib/schema";

export const runtime = "nodejs";

// Remove a document from a gifting order. Admin-only.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const [row] = await db
    .select({ blobUrl: influencerOrderAttachment.blobUrl })
    .from(influencerOrderAttachment)
    .where(eq(influencerOrderAttachment.id, id));
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Best-effort blob removal; always remove the DB row.
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await del(row.blobUrl);
    } catch (err) {
      console.error("Blob delete failed (continuing):", err);
    }
  }
  await db
    .delete(influencerOrderAttachment)
    .where(eq(influencerOrderAttachment.id, id));

  return NextResponse.json({ data: { id } });
}
