import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  listConnectedMailboxes,
  listInboundFromAllMailboxes,
  listSentToAllMailboxes,
  type InboundMessage,
} from "@/lib/gmail/inbound";

export const runtime = "nodejs";

// Email history for one or more addresses (comma-separated `emails`), searched
// across all connected team inboxes. Used by the per-customer / per-company /
// per-supplier Messages view. `?direction=sent` returns mail WE sent those
// addresses; otherwise mail they sent us. Returns `{ replies, mailboxes }`;
// `[]` when no emails / no connected Google account.
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
  if (emails.length === 0) {
    return NextResponse.json({ data: { replies: [], mailboxes: [] } });
  }

  const lister =
    direction === "sent" ? listSentToAllMailboxes : listInboundFromAllMailboxes;
  const [perEmail, mailboxes] = await Promise.all([
    Promise.all(emails.map((e) => lister(e))),
    listConnectedMailboxes(),
  ]);

  // Merge across addresses, dedup by gmail message id, newest first.
  const byId = new Map<string, InboundMessage>();
  for (const m of perEmail.flat()) {
    if (!byId.has(m.id)) byId.set(m.id, m);
  }
  const replies = [...byId.values()].sort((a, b) => b.dateMs - a.dateMs);

  return NextResponse.json({
    data: { replies, mailboxes: mailboxes.map((m) => m.label) },
  });
}
