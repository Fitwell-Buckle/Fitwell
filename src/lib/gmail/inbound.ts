import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { account, user as userTable } from "@/lib/schema";
import { buildReplyQuery } from "./reply-query";
import { ensureFreshAccessToken, getGoogleAccount } from "./token";

export { buildReplyQuery };

export interface ReplyCheck {
  // True when at least one inbound message from the address exists since the date.
  replied: boolean;
  // False when we couldn't check (no connected Google account / token / API error)
  // — callers should treat "not checked" as "no confirmed reply".
  checked: boolean;
}

export interface InboundMessage {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  // Epoch ms of the message's internal date (for "new" comparison + display).
  dateMs: number;
  // Which team inbox this message was found in (set by the cross-mailbox
  // search). Undefined for single-mailbox results.
  mailbox?: string;
}

// Every team member who has connected a Google account, so we can search their
// inbox. Used to show a contact's full email history across the whole team —
// e.g. when the contact emailed a colleague instead of the lead owner.
export interface Mailbox {
  userId: string;
  label: string; // whose inbox (name / email)
}

export async function listConnectedMailboxes(): Promise<Mailbox[]> {
  const rows = await db
    .select({
      userId: account.userId,
      name: userTable.name,
      email: userTable.email,
      role: userTable.role,
    })
    .from(account)
    .innerJoin(userTable, eq(account.userId, userTable.id))
    .where(eq(account.provider, "google"));
  return rows
    // Internal/admin inboxes only — never a supplier's or company's.
    .filter((r) => r.role !== "supplier" && r.role !== "company")
    .map((r) => ({ userId: r.userId, label: r.name || r.email || "Inbox" }));
}

// Fetch up to `max` recent messages from `fromEmail` in `userId`'s Gmail
// (newest first). Returns [] on any failure / no Google connection — the
// caller treats that as "no replies to show".
export async function listInboundFrom(
  userId: string,
  fromEmail: string,
  max = 10,
): Promise<InboundMessage[]> {
  if (!fromEmail) return [];
  try {
    const acc = await getGoogleAccount(userId);
    if (!acc?.access_token) return [];
    const token = await ensureFreshAccessToken(acc);
    if (!token) return [];

    const q = `from:${fromEmail}`;
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${max}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!listRes.ok) return [];
    const listData = (await listRes.json()) as { messages?: { id: string }[] };
    const ids = (listData.messages ?? []).map((m) => m.id);
    if (ids.length === 0) return [];

    const msgs = await Promise.all(
      ids.map(async (id) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!r.ok) return null;
        const m = (await r.json()) as {
          id: string;
          snippet?: string;
          internalDate?: string;
          payload?: { headers?: { name: string; value: string }[] };
        };
        const header = (n: string) =>
          m.payload?.headers?.find((h) => h.name === n)?.value ?? "";
        return {
          id: m.id,
          from: header("From"),
          subject: header("Subject"),
          snippet: m.snippet ?? "",
          dateMs: m.internalDate ? Number(m.internalDate) : 0,
        } satisfies InboundMessage;
      }),
    );
    return msgs
      .filter((m): m is InboundMessage => m !== null)
      .sort((a, b) => b.dateMs - a.dateMs);
  } catch {
    return [];
  }
}

// Does `fromEmail` appear as a sender in `userId`'s Gmail since `since`?
// Uses the user's stored Google OAuth token (auto-refreshed). Never throws —
// returns {checked:false} on any failure so the caller can decide.
export async function hasInboundEmailFrom(
  userId: string,
  fromEmail: string,
  since: Date,
): Promise<ReplyCheck> {
  if (!fromEmail) return { replied: false, checked: false };
  try {
    const acc = await getGoogleAccount(userId);
    if (!acc?.access_token) return { replied: false, checked: false };
    const token = await ensureFreshAccessToken(acc);
    if (!token) return { replied: false, checked: false };

    const q = buildReplyQuery(fromEmail, since);
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=1`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { replied: false, checked: false };
    const data = (await res.json()) as { messages?: { id: string }[] };
    return { replied: (data.messages?.length ?? 0) > 0, checked: true };
  } catch {
    return { replied: false, checked: false };
  }
}

// Every message from `fromEmail` across ALL connected team inboxes (not just
// the lead owner's), newest first, each tagged with the inbox it was found in.
// Lets the Replies tab show a contact's full history even when they emailed a
// colleague. Returns [] when no Google accounts are connected.
export async function listInboundFromAllMailboxes(
  fromEmail: string,
  maxPerMailbox = 10,
): Promise<InboundMessage[]> {
  if (!fromEmail) return [];
  const mailboxes = await listConnectedMailboxes();
  if (mailboxes.length === 0) return [];
  const perBox = await Promise.all(
    mailboxes.map(async (mb) => {
      const msgs = await listInboundFrom(mb.userId, fromEmail, maxPerMailbox);
      return msgs.map((m) => ({ ...m, mailbox: mb.label }));
    }),
  );
  return perBox.flat().sort((a, b) => b.dateMs - a.dateMs);
}

// Does `fromEmail` appear in ANY connected team inbox since `since`? Used for
// the lead's "new replies" dot so it lights up even if the contact replied to
// a colleague. {checked:true} as soon as one mailbox confirms; {checked:false}
// only when no mailbox could be checked at all.
export async function hasInboundFromAnyMailbox(
  fromEmail: string,
  since: Date,
): Promise<ReplyCheck> {
  if (!fromEmail) return { replied: false, checked: false };
  const mailboxes = await listConnectedMailboxes();
  if (mailboxes.length === 0) return { replied: false, checked: false };
  const results = await Promise.all(
    mailboxes.map((mb) => hasInboundEmailFrom(mb.userId, fromEmail, since)),
  );
  return {
    replied: results.some((r) => r.replied),
    checked: results.some((r) => r.checked),
  };
}
