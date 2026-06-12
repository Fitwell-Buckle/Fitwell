import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { company } from "@/lib/schema";
import {
  listInboundFromAllMailboxes,
  listSentToAllMailboxes,
  type InboundMessage,
} from "@/lib/gmail/inbound";

export const runtime = "nodejs";

// Mirror of the PO Activity feed's email shape so the B2B customer Activity tab
// renders correspondence identically.
export interface CompanyEmail {
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
  const authq = mailboxEmail
    ? `?authuser=${encodeURIComponent(mailboxEmail)}`
    : "";
  return `https://mail.google.com/mail/${authq}#all/${threadId}`;
}

/**
 * Email correspondence for a B2B customer (company), across all connected team
 * inboxes — both received from and sent to the company's contact addresses.
 * Admin-only; loaded lazily by the customer Activity tab so the page render
 * never blocks on Gmail. Mirrors `/api/production/po/[id]/emails`.
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
  const comp = await db.query.company.findFirst({
    where: eq(company.id, id),
    columns: { contactEmail: true },
    with: { contacts: { columns: { email: true } } },
  });
  if (!comp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Same address set the Overview Messages panel used: the company's free-text
  // contact email + every portal-login contact email.
  const addresses = [
    ...new Set(
      [comp.contactEmail, ...comp.contacts.map((c) => c.email)]
        .filter((e): e is string => Boolean(e))
        .map((e) => e.trim().toLowerCase()),
    ),
  ];
  if (addresses.length === 0) {
    return NextResponse.json({ data: { emails: [] } });
  }

  let merged: InboundMessage[] = [];
  try {
    const lists = await Promise.all(
      addresses.flatMap((a) => [
        listInboundFromAllMailboxes(a),
        listSentToAllMailboxes(a),
      ]),
    );
    // Dedupe across inboxes + directions by Gmail message id.
    const byId = new Map<string, InboundMessage>();
    for (const m of lists.flat()) if (!byId.has(m.id)) byId.set(m.id, m);
    merged = [...byId.values()];
  } catch {
    // Gmail unreachable / not connected — show the rest of the feed.
    return NextResponse.json({ data: { emails: [] } });
  }

  const emails: CompanyEmail[] = merged
    .sort((a, b) => b.dateMs - a.dateMs)
    .slice(0, 50)
    .map((m) => ({
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
