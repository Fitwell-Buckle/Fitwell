import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setLeadRepliesSeen } from "@/lib/crm/service";

// Mark the lead's Replies tab as viewed (clears the "new replies" dot).
export async function POST(
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
  await setLeadRepliesSeen(id);
  return NextResponse.json({ data: { ok: true } });
}
