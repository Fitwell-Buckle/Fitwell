import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { customer, lead, sentEmail, supplier } from "@/lib/schema";
import {
  hasInboundFromAnyMailbox,
  listConnectedMailboxes,
  listRecentSent,
} from "@/lib/gmail/inbound";
import { parseEmailAddress } from "./customer-match";
import { draftFollowupEmail, DRAFT_MODEL_NAME } from "@/lib/ai/anthropic";
import { createOutboundMessage } from "./messages";
import { followupSubject } from "./sent-followups-subject";

// Follow-ups on emails WE sent: scan connected admins' Gmail Sent folders, match
// each recipient to a known lead/customer/supplier, and — when the configured
// wait passes with no reply — draft a follow-up that REPLIES in the original
// thread, queued into Next Steps. Pure subject helper is unit-tested below.

type Match = {
  leadId?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
};

// email (lowercased) → which contact it belongs to. Lead wins over supplier over
// customer when the same address appears in more than one (sales context first).
async function buildRecipientIndex(): Promise<Map<string, Match>> {
  const [leads, customers, suppliers] = await Promise.all([
    db.select({ id: lead.id, email: lead.email }).from(lead),
    db.select({ id: customer.id, email: customer.email }).from(customer),
    db.select({ id: supplier.id, email: supplier.contactEmail }).from(supplier),
  ]);
  const idx = new Map<string, Match>();
  const norm = (e: string | null) => (e ?? "").trim().toLowerCase();
  for (const c of customers) {
    const k = norm(c.email);
    if (k) idx.set(k, { customerId: c.id });
  }
  for (const s of suppliers) {
    const k = norm(s.email);
    if (k) idx.set(k, { supplierId: s.id });
  }
  for (const l of leads) {
    const k = norm(l.email);
    if (k) idx.set(k, { leadId: l.id });
  }
  return idx;
}

// Scan recent Sent mail across connected inboxes; record each message to a known
// contact in sent_email (dedup on the Gmail message id). `days` is the look-back
// window — the daily cron uses the default; a manual catch-up run can widen it
// to pick up older sends.
export async function scanSentEmails(days = 30): Promise<{
  scanned: number;
  inserted: number;
}> {
  const mailboxes = await listConnectedMailboxes();
  if (mailboxes.length === 0) return { scanned: 0, inserted: 0 };
  const idx = await buildRecipientIndex();

  let scanned = 0;
  let inserted = 0;
  for (const mb of mailboxes) {
    const sent = await listRecentSent(mb.userId, 200, days);
    for (const m of sent) {
      scanned++;
      const toAddr = parseEmailAddress(m.to ?? "");
      if (!toAddr) continue;
      const match = idx.get(toAddr.toLowerCase());
      if (!match) continue;
      const rows = await db
        .insert(sentEmail)
        .values({
          gmailMessageId: m.id,
          threadId: m.threadId,
          messageIdHeader: m.messageId ?? null,
          mailboxUserId: mb.userId,
          fromEmail: parseEmailAddress(m.from) ?? null,
          toEmail: toAddr,
          subject: m.subject || null,
          sentAt: m.dateMs ? new Date(m.dateMs) : null,
          leadId: match.leadId ?? null,
          customerId: match.customerId ?? null,
          supplierId: match.supplierId ?? null,
        })
        .onConflictDoNothing({ target: sentEmail.gmailMessageId })
        .returning({ id: sentEmail.id });
      if (rows.length > 0) inserted++;
    }
  }
  return { scanned, inserted };
}

// For tracked sent emails older than `waitDays` with no reply and no follow-up
// yet: confirm there's still no reply, then draft a threaded follow-up into
// Next Steps (attributed to the sender, so it goes from their Gmail in-thread).
export async function generateSentFollowups(
  waitDays: number,
  limit = 25,
): Promise<{ candidates: number; drafted: number; skippedReplied: number }> {
  const cutoff = new Date(Date.now() - waitDays * 24 * 60 * 60 * 1000);
  const due = await db
    .select()
    .from(sentEmail)
    .where(
      and(
        lte(sentEmail.sentAt, cutoff),
        isNull(sentEmail.repliedAt),
        isNull(sentEmail.followupQueuedAt),
      ),
    )
    .orderBy(asc(sentEmail.sentAt))
    .limit(limit);

  let drafted = 0;
  let skippedReplied = 0;

  for (const s of due) {
    const since = s.sentAt ?? cutoff;
    const { replied, checked } = await hasInboundFromAnyMailbox(s.toEmail, since);
    if (checked && replied) {
      await db
        .update(sentEmail)
        .set({ repliedAt: new Date() })
        .where(eq(sentEmail.id, s.id));
      skippedReplied++;
      continue;
    }

    // Pull whatever context we have for a warmer draft.
    const ctx: {
      firstName?: string | null;
      lastName?: string | null;
      companyName?: string | null;
      title?: string | null;
    } = {};
    if (s.leadId) {
      const l = await db.query.lead.findFirst({
        where: eq(lead.id, s.leadId),
        columns: { firstName: true, lastName: true, companyName: true, title: true },
      });
      if (l) Object.assign(ctx, l);
    } else if (s.customerId) {
      const c = await db.query.customer.findFirst({
        where: eq(customer.id, s.customerId),
        columns: { firstName: true, lastName: true },
      });
      if (c) Object.assign(ctx, c);
    } else if (s.supplierId) {
      const sup = await db.query.supplier.findFirst({
        where: eq(supplier.id, s.supplierId),
        columns: { name: true, contactName: true },
      });
      if (sup) ctx.companyName = sup.name;
    }

    try {
      const draft = await draftFollowupEmail({ ...ctx, isNudge: true });
      await createOutboundMessage({
        leadId: s.leadId,
        customerId: s.customerId,
        supplierId: s.supplierId,
        toEmail: s.toEmail,
        subject: followupSubject(s.subject, draft.subject),
        body: draft.body,
        sequenceStep: 2,
        generatedByModel: DRAFT_MODEL_NAME,
        createdByUserId: s.mailboxUserId,
        threadId: s.threadId,
        inReplyTo: s.messageIdHeader,
      });
      await db
        .update(sentEmail)
        .set({ followupQueuedAt: new Date() })
        .where(eq(sentEmail.id, s.id));
      drafted++;
    } catch (err) {
      console.error(`sent-followups: draft failed for ${s.id}`, err);
    }
  }

  return { candidates: due.length, drafted, skippedReplied };
}
