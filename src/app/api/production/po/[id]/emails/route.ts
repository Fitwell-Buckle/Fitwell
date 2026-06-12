import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPoDetail } from "@/lib/production/service";
import { formatPoNumber } from "@/lib/production/sub-po";
import { searchMessagesAllMailboxes } from "@/lib/gmail/inbound";

export interface PoEmail {
  id: string;
  threadId: string | null;
  from: string;
  subject: string | null;
  snippet: string | null;
  dateMs: number;
  mailbox: string | null;
  gmailUrl: string | null;
}

function gmailUrl(threadId: string, mailboxEmail?: string): string {
  const auth = mailboxEmail
    ? `?authuser=${encodeURIComponent(mailboxEmail)}`
    : "";
  return `https://mail.google.com/mail/${auth}#all/${threadId}`;
}

/**
 * Emails across the team's connected Gmail inboxes that mention this PO — by
 * its number or one of its SKUs (subject OR body). Admin-only; loaded lazily by
 * the PO Activity tab so the page render never blocks on Gmail.
 */
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
  const po = await getPoDetail(id);
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Line items live on the master; a sub-PO shares the master's number + SKUs.
  const master = po.parentPoId ? await getPoDetail(po.parentPoId) : po;
  const itemSource = master ?? po;

  // Search terms: the PO number (formatted + raw) and its SKUs (capped so the
  // Gmail OR query stays bounded). Quote each so multi-token SKUs match exactly.
  const formatted = formatPoNumber(po.shopifyPoNumber);
  const terms = Array.from(
    new Set(
      [
        formatted,
        po.shopifyPoNumber,
        ...itemSource.lineItems.slice(0, 12).map((li) => li.sku),
      ]
        .map((t) => String(t).trim())
        .filter(Boolean),
    ),
  );
  if (terms.length === 0) {
    return NextResponse.json({ data: { emails: [] } });
  }
  const query = terms.map((t) => `"${t}"`).join(" OR ");

  const messages = await searchMessagesAllMailboxes(query, 15, session.user.id);
  const emails: PoEmail[] = messages.slice(0, 40).map((m) => ({
    id: m.id,
    threadId: m.threadId ?? null,
    from: m.from,
    subject: m.subject || null,
    snippet: m.snippet || null,
    dateMs: m.dateMs,
    mailbox: m.mailbox ?? null,
    gmailUrl: m.threadId ? gmailUrl(m.threadId, m.mailboxEmail) : null,
  }));

  return NextResponse.json({ data: { emails } });
}
