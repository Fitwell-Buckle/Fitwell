import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLead } from "@/lib/crm/service";
import { listInboundFromAllMailboxes } from "@/lib/gmail/inbound";

export const runtime = "nodejs";

// The contact's emails to us — fetched live across ALL connected team inboxes
// (not just the lead owner's), so a contact who emailed a colleague still
// shows up. Each reply is tagged with the inbox it was found in. Returns []
// when there's no email or no connected Google account.
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

  const replies = await listInboundFromAllMailboxes(lead.email);
  return NextResponse.json({ data: { replies } });
}
