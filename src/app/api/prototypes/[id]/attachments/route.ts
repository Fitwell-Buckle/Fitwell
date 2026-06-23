import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { handleUpload } from "@/lib/prototypes/upload";

export const runtime = "nodejs";

// Concept-level reference art / spec docs attached to the prototype itself
// (round sample photos go through the round attachments route instead).
export async function POST(
  req: Request,
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
  return handleUpload(req, session, { prototypeId: id }, `prototypes/${id}`);
}
