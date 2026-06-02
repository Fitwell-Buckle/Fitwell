import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  listConnectedMailboxes,
  listInboundFromAllMailboxes,
  listSentToAllMailboxes,
  type InboundMessage,
} from "@/lib/gmail/inbound";
import { listWhatsappAsMessages } from "@/lib/crm/whatsapp-messages";

export const runtime = "nodejs";

// A contact's message history across both channels. Email: one or more
// addresses (comma-separated `emails`), searched across all connected team
// inboxes. WhatsApp: matched by the contact's stored id, passed as `waType`
// (customer | supplier) + `waId`. `?direction=sent` returns what WE sent;
// otherwise inbound. Each row is tagged with its channel ("email"/"whatsapp").
// Used by the per-customer / per-supplier Messages view.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const direction =
    url.searchParams.get("direction") === "sent" ? "sent" : "received";
  const emails = [
    ...new Set(
      (url.searchParams.get("emails") ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  const waType = url.searchParams.get("waType");
  const waId = url.searchParams.get("waId") ?? undefined;
  const waMatch =
    waId && waType === "customer"
      ? { customerId: waId }
      : waId && waType === "supplier"
        ? { supplierId: waId }
        : null;

  const lister =
    direction === "sent" ? listSentToAllMailboxes : listInboundFromAllMailboxes;
  const [perEmail, mailboxes, whatsapp] = await Promise.all([
    Promise.all(emails.map((e) => lister(e))),
    listConnectedMailboxes(),
    waMatch ? listWhatsappAsMessages(waMatch, direction) : Promise.resolve([]),
  ]);

  // Merge email across addresses (dedup by gmail id), tag channel, add WhatsApp.
  const byId = new Map<string, InboundMessage>();
  for (const m of perEmail.flat()) {
    if (!byId.has(m.id)) byId.set(m.id, m);
  }
  const email = [...byId.values()].map((m) => ({ ...m, channel: "email" as const }));
  const replies = [...email, ...whatsapp].sort((a, b) => b.dateMs - a.dateMs);

  return NextResponse.json({
    data: { replies, mailboxes: mailboxes.map((m) => m.label) },
  });
}
