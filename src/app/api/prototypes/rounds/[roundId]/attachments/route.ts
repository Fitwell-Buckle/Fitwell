import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { handleUpload } from "@/lib/prototypes/upload";

export const runtime = "nodejs";

// Sample photos for a specific prototype round.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ roundId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { roundId } = await params;
  return handleUpload(
    req,
    session,
    { roundId },
    `prototypes/rounds/${roundId}`,
  );
}
