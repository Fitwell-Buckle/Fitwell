import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLead } from "@/lib/crm/service";
import {
  listConnectedMailboxes,
  listInboundFromAllMailboxes,
  listSentToAllMailboxes,
  type InboundMessage,
} from "@/lib/gmail/inbound";
import { listWhatsappAsMessages } from "@/lib/crm/whatsapp-messages";

export const runtime = "nodejs";

// The lead's message history across both channels: email (live across ALL
// connected team inboxes, so a contact who emailed a colleague — or a colleague
// who emailed the contact — still shows) and WhatsApp (matched by phone).
// `?direction=sent` returns what WE sent; otherwise inbound. Each message is
// tagged with its channel ("email"/"whatsapp") and, for email, the inbox.
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

  // Email (only when the lead has an address) + WhatsApp (by lead id) in
  // parallel; tag email rows with channel and drop dismissed inbound replies.
  const dismissed = new Set(lead.dismissedReplyIds ?? []);
  const tagEmail = (m: InboundMessage) => ({ ...m, channel: "email" as const });

  const [emailRaw, mailboxes, whatsapp] = await Promise.all([
    lead.email
      ? direction === "sent"
        ? listSentToAllMailboxes(lead.email)
        : listInboundFromAllMailboxes(lead.email)
      : Promise.resolve<InboundMessage[]>([]),
    listConnectedMailboxes(),
    listWhatsappAsMessages({ leadId: id }, direction),
  ]);

  const email = emailRaw
    .filter((r) => direction === "sent" || !dismissed.has(r.id))
    .map(tagEmail);
  const replies = [...email, ...whatsapp].sort((a, b) => b.dateMs - a.dateMs);

  return NextResponse.json({
    data: { replies, mailboxes: mailboxes.map((m) => m.label) },
  });
}
