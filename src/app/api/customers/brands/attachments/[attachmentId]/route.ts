import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companyAttachment } from "@/lib/schema";

// Remove a manually-uploaded company document. Admin-only. (PO-sourced
// documents shown on the profile are read-only and not deletable here.)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { attachmentId } = await params;
  await db
    .delete(companyAttachment)
    .where(eq(companyAttachment.id, attachmentId));
  return NextResponse.json({ data: { ok: true } });
}
