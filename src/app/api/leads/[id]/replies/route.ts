import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLead } from "@/lib/crm/service";
import {
  listConnectedMailboxes,
  listInboundFromAllMailboxes,
  listSentToAllMailboxes,
} from "@/lib/gmail/inbound";

export const runtime = "nodejs";

// The lead's email history, fetched live across ALL connected team inboxes (not
// just the lead owner's) so a contact who emailed a colleague — or a colleague
// who emailed the contact — still shows up. `?direction=sent` returns mail WE
// sent the contact; otherwise the contact's inbound mail. Each message is tagged
// with the inbox it was found in. Returns [] when there's no email or no
// connected Google account.
export async function GET(
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

  const direction =
    new URL(req.url).searchParams.get("direction") === "sent"
      ? "sent"
      : "received";

  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (!lead.email) {
    return NextResponse.json({ data: { replies: [], mailboxes: [] } });
  }

  if (direction === "sent") {
    const [sent, mailboxes] = await Promise.all([
      listSentToAllMailboxes(lead.email),
      listConnectedMailboxes(),
    ]);
    return NextResponse.json({
      data: { replies: sent, mailboxes: mailboxes.map((m) => m.label) },
    });
  }

  const [allReplies, mailboxes] = await Promise.all([
    listInboundFromAllMailboxes(lead.email),
    listConnectedMailboxes(),
  ]);
  // Drop replies the user dismissed from this lead's tab.
  const dismissed = new Set(lead.dismissedReplyIds ?? []);
  const replies = allReplies.filter((r) => !dismissed.has(r.id));
  return NextResponse.json({
    data: { replies, mailboxes: mailboxes.map((m) => m.label) },
  });
}
