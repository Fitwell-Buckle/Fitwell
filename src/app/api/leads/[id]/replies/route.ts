import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLead } from "@/lib/crm/service";
import { listInboundFrom } from "@/lib/gmail/inbound";

export const runtime = "nodejs";

// The lead's replies to us — fetched live from the lead owner's (fallback:
// the signed-in admin's) Gmail. Returns [] when there's no email or no
// connected Google account.
export async function GET(
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
  const lead = await getLead(id);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (!lead.email) {
    return NextResponse.json({ data: { replies: [] } });
  }

  const mailboxUserId =
    lead.ownerUserId ?? lead.capturedByUserId ?? session.user.id;
  const replies = await listInboundFrom(mailboxUserId, lead.email);
  return NextResponse.json({ data: { replies } });
}
