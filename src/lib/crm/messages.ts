import { z } from "zod";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/lib/db";
import { createAdminNotification } from "@/lib/notifications/admin-notify";
import {
  customer,
  lead,
  outboundMessage,
  supplier,
} from "@/lib/schema";
import { leadDisplayName } from "./display";
import {
  isValidRecipientList,
  normalizeRecipients,
} from "./email-recipients";

export const MESSAGE_STATUSES = [
  "draft",
  "scheduled",
  "sent",
  "dismissed",
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export interface CreateOutboundMessageInput {
  // Exactly one of these identifies the recipient contact.
  leadId?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  toEmail?: string | null;
  // Optional comma-separated Cc / Bcc recipient lists (normalized on insert).
  cc?: string | null;
  bcc?: string | null;
  subject?: string | null;
  body: string;
  // 1 = initial follow-up, 2 = two-week nudge. Defaults to 1.
  sequenceStep?: number;
  generatedByModel?: string | null;
  createdByUserId?: string | null;
  // For a threaded follow-up (reply in the original Gmail thread).
  threadId?: string | null;
  inReplyTo?: string | null;
}

export async function createOutboundMessage(
  input: CreateOutboundMessageInput,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(outboundMessage)
    .values({
      leadId: input.leadId ?? null,
      customerId: input.customerId ?? null,
      supplierId: input.supplierId ?? null,
      sequenceStep: input.sequenceStep ?? 1,
      toEmail: input.toEmail ?? null,
      cc: normalizeRecipients(input.cc),
      bcc: normalizeRecipients(input.bcc),
      subject: input.subject ?? null,
      body: input.body,
      threadId: input.threadId ?? null,
      inReplyTo: input.inReplyTo ?? null,
      generatedByModel: input.generatedByModel ?? null,
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning({ id: outboundMessage.id });

  // Raise an in-app alert (bell + /notifications) so a queued draft isn't
  // missed. Best-effort — never block draft creation on the notification.
  try {
    let name = input.toEmail ?? "a contact";
    if (input.leadId) {
      const who = await db.query.lead.findFirst({
        where: eq(lead.id, input.leadId),
        columns: { firstName: true, lastName: true, companyName: true, email: true },
      });
      if (who) name = leadDisplayName(who);
    } else if (input.customerId) {
      const who = await db.query.customer.findFirst({
        where: eq(customer.id, input.customerId),
        columns: { firstName: true, lastName: true, email: true },
      });
      if (who) name = leadDisplayName(who);
    } else if (input.supplierId) {
      const who = await db.query.supplier.findFirst({
        where: eq(supplier.id, input.supplierId),
        columns: { name: true },
      });
      if (who) name = who.name;
    }
    const kind = (input.sequenceStep ?? 1) >= 2 ? "follow-up nudge" : "follow-up";
    await createAdminNotification({
      type: "lead_followup_drafted",
      title: `Draft ${kind} ready for ${name}`,
      body: input.subject ?? null,
      leadId: input.leadId ?? null,
    });
  } catch (err) {
    console.error("createOutboundMessage: notification insert failed", err);
  }

  return { id: row.id };
}

export async function getOutboundMessage(id: string) {
  return db.query.outboundMessage.findFirst({
    where: eq(outboundMessage.id, id),
  });
}

// Ensure a queued message has an open-tracking token before it's sent. New rows
// get one at insert (schema default); this backfills any pre-tracking row.
export async function ensureTrackToken(
  id: string,
  existing: string | null,
): Promise<string> {
  if (existing) return existing;
  const token = crypto.randomUUID();
  await db
    .update(outboundMessage)
    .set({ trackToken: token })
    .where(eq(outboundMessage.id, id));
  return token;
}

// Record an open: bump the count and stamp first/last opened. Called by the
// public tracking-pixel route when a recipient's client loads the pixel.
// Idempotent-ish — every pixel load counts (proxies may load more than once).
export async function recordOpen(token: string): Promise<void> {
  await db
    .update(outboundMessage)
    .set({
      openCount: sql`${outboundMessage.openCount} + 1`,
      lastOpenedAt: sql`now()`,
      firstOpenedAt: sql`coalesce(${outboundMessage.firstOpenedAt}, now())`,
    })
    .where(eq(outboundMessage.trackToken, token));
}

// Persist an ad-hoc Compose reply (sent directly, not from the queue) as a
// `sent` outbound_message so its opens are tracked alongside everything else.
// No draft notification — it's already gone out.
export async function logSentMessage(input: {
  toEmail: string;
  cc?: string | null;
  bcc?: string | null;
  subject?: string | null;
  body: string;
  threadId?: string | null;
  inReplyTo?: string | null;
  createdByUserId?: string | null;
  trackToken: string;
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(outboundMessage)
    .values({
      toEmail: input.toEmail,
      cc: normalizeRecipients(input.cc),
      bcc: normalizeRecipients(input.bcc),
      subject: input.subject ?? null,
      body: input.body,
      threadId: input.threadId ?? null,
      inReplyTo: input.inReplyTo ?? null,
      createdByUserId: input.createdByUserId ?? null,
      trackToken: input.trackToken,
      status: "sent",
      sentAt: new Date(),
    })
    .returning({ id: outboundMessage.id });
  return { id: row.id };
}

// All messages for one lead (any status), newest first — drives the lead
// detail "History" tab.
export async function listMessagesForLead(leadId: string) {
  return db
    .select({
      id: outboundMessage.id,
      sequenceStep: outboundMessage.sequenceStep,
      subject: outboundMessage.subject,
      status: outboundMessage.status,
      createdAt: outboundMessage.createdAt,
      sentAt: outboundMessage.sentAt,
      openCount: outboundMessage.openCount,
      lastOpenedAt: outboundMessage.lastOpenedAt,
    })
    .from(outboundMessage)
    .where(eq(outboundMessage.leadId, leadId))
    .orderBy(desc(outboundMessage.createdAt));
}

// Leads due for a two-week nudge: their initial follow-up (step 1) was marked
// SENT ≥ `olderThanDays` ago, the lead is still active, hasn't replied, and
// has no step-2 message yet. Returns the lead context + the anchor sentAt so
// the cron can date-bound the Gmail reply check.
export interface NudgeCandidate {
  leadId: string;
  ownerUserId: string | null;
  capturedByUserId: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  title: string | null;
  stage: string;
  notes: string | null;
  sentAt: Date;
}

export async function findLeadsNeedingNudge(
  olderThanDays: number,
  limit = 25,
): Promise<NudgeCandidate[]> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  // The most recent step-1 message that was sent for each lead.
  const sentFirst = db
    .select({
      leadId: outboundMessage.leadId,
      sentAt: sql<Date>`max(${outboundMessage.sentAt})`.as("sent_at"),
    })
    .from(outboundMessage)
    .where(
      and(
        eq(outboundMessage.sequenceStep, 1),
        eq(outboundMessage.status, "sent"),
      ),
    )
    .groupBy(outboundMessage.leadId)
    .as("sent_first");

  // Leads that already have a step-2 (nudge) message — to exclude.
  const hasNudge = db
    .selectDistinct({ leadId: outboundMessage.leadId })
    .from(outboundMessage)
    .where(sql`${outboundMessage.sequenceStep} >= 2`)
    .as("has_nudge");

  const rows = await db
    .select({
      leadId: lead.id,
      ownerUserId: lead.ownerUserId,
      capturedByUserId: lead.capturedByUserId,
      email: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      companyName: lead.companyName,
      title: lead.title,
      stage: lead.stage,
      notes: lead.notes,
      sentAt: sentFirst.sentAt,
    })
    .from(lead)
    .innerJoin(sentFirst, eq(sentFirst.leadId, lead.id))
    .leftJoin(hasNudge, eq(hasNudge.leadId, lead.id))
    .where(
      and(
        eq(lead.status, "active"),
        isNull(lead.repliedAt),
        isNull(hasNudge.leadId),
        lte(sentFirst.sentAt, cutoff),
      ),
    )
    .limit(limit);

  return rows.filter((r): r is NudgeCandidate => r.sentAt != null);
}

// List messages joined with their contact's display fields (lead, customer, or
// supplier — whichever the message targets). Defaults to the pending queue
// (status='draft'); pass status/statuses to view others, and/or leadId to scope
// to one lead.
export async function listOutboundMessages(
  filters: { status?: string; statuses?: string[]; leadId?: string } = {},
) {
  const statusCond = filters.statuses
    ? inArray(outboundMessage.status, filters.statuses)
    : eq(outboundMessage.status, filters.status ?? "draft");
  const conds: SQL[] = [statusCond];
  if (filters.leadId) conds.push(eq(outboundMessage.leadId, filters.leadId));
  return db
    .select({
      id: outboundMessage.id,
      leadId: outboundMessage.leadId,
      customerId: outboundMessage.customerId,
      supplierId: outboundMessage.supplierId,
      channel: outboundMessage.channel,
      toEmail: outboundMessage.toEmail,
      cc: outboundMessage.cc,
      bcc: outboundMessage.bcc,
      subject: outboundMessage.subject,
      body: outboundMessage.body,
      status: outboundMessage.status,
      createdAt: outboundMessage.createdAt,
      sentAt: outboundMessage.sentAt,
      scheduledAt: outboundMessage.scheduledAt,
      leadFirstName: lead.firstName,
      leadLastName: lead.lastName,
      leadCompanyName: lead.companyName,
      customerFirstName: customer.firstName,
      customerLastName: customer.lastName,
      supplierName: supplier.name,
    })
    .from(outboundMessage)
    .leftJoin(lead, eq(outboundMessage.leadId, lead.id))
    .leftJoin(customer, eq(outboundMessage.customerId, customer.id))
    .leftJoin(supplier, eq(outboundMessage.supplierId, supplier.id))
    .where(and(...conds))
    .orderBy(desc(outboundMessage.createdAt));
}

// Scheduled messages whose time has arrived — sent by the send-scheduled cron.
// Carries thread fields so a scheduled follow-up still threads on send.
export async function findDueScheduledMessages(limit = 25) {
  return db
    .select({
      id: outboundMessage.id,
      toEmail: outboundMessage.toEmail,
      cc: outboundMessage.cc,
      bcc: outboundMessage.bcc,
      subject: outboundMessage.subject,
      body: outboundMessage.body,
      createdByUserId: outboundMessage.createdByUserId,
      threadId: outboundMessage.threadId,
      inReplyTo: outboundMessage.inReplyTo,
      trackToken: outboundMessage.trackToken,
    })
    .from(outboundMessage)
    .where(
      and(
        eq(outboundMessage.status, "scheduled"),
        isNotNull(outboundMessage.scheduledAt),
        lte(outboundMessage.scheduledAt, new Date()),
      ),
    )
    .orderBy(asc(outboundMessage.scheduledAt))
    .limit(limit);
}

export async function countDraftMessages(): Promise<number> {
  const rows = await db
    .select({ id: outboundMessage.id })
    .from(outboundMessage)
    .where(eq(outboundMessage.status, "draft"));
  return rows.length;
}

// Lead IDs with at least one draft "next step" queued — used to flag rows on
// the leads list with a blue dot.
export async function leadIdsWithDraftMessages(): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ leadId: outboundMessage.leadId })
    .from(outboundMessage)
    .where(eq(outboundMessage.status, "draft"));
  return new Set(
    rows.map((r) => r.leadId).filter((id): id is string => id !== null),
  );
}

// Company IDs that have a pending follow-up (draft or scheduled) for any of
// their attached People — a lead or a Shopify customer linked to the company.
// Used to flag rows on the B2B customers list with a "Next Steps" dot.
export async function companyIdsWithNextSteps(): Promise<Set<string>> {
  const pending = ["draft", "scheduled"];
  const [viaLeads, viaCustomers] = await Promise.all([
    db
      .selectDistinct({ companyId: lead.companyId })
      .from(outboundMessage)
      .innerJoin(lead, eq(outboundMessage.leadId, lead.id))
      .where(
        and(
          inArray(outboundMessage.status, pending),
          isNotNull(lead.companyId),
        ),
      ),
    db
      .selectDistinct({ companyId: customer.companyId })
      .from(outboundMessage)
      .innerJoin(customer, eq(outboundMessage.customerId, customer.id))
      .where(
        and(
          inArray(outboundMessage.status, pending),
          isNotNull(customer.companyId),
        ),
      ),
  ]);
  const set = new Set<string>();
  for (const r of viaLeads) if (r.companyId) set.add(r.companyId);
  for (const r of viaCustomers) if (r.companyId) set.add(r.companyId);
  return set;
}

export const updateMessageSchema = z
  .object({
    subject: z.string().max(500).nullish(),
    body: z.string().max(20_000).optional(),
    toEmail: z.string().email().max(320).nullish().or(z.literal("")),
    // Comma-separated Cc / Bcc lists; "" clears the field. Validated as a list
    // of email addresses (each part must be a valid address).
    cc: z
      .string()
      .max(1000)
      .nullish()
      .refine(isValidRecipientList, { message: "Cc has an invalid email" }),
    bcc: z
      .string()
      .max(1000)
      .nullish()
      .refine(isValidRecipientList, { message: "Bcc has an invalid email" }),
    status: z.enum(MESSAGE_STATUSES).optional(),
    // ISO datetime for a scheduled send; null clears it (back to a plain draft).
    scheduledAt: z.string().datetime().nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "no fields to update",
  });
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;

export async function updateOutboundMessage(
  id: string,
  input: UpdateMessageInput,
  // The acting user — recorded as createdByUserId when scheduling so the
  // send-scheduled cron knows whose Gmail to send from later.
  actingUserId?: string,
): Promise<{ id: string } | null> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.subject !== undefined) patch.subject = input.subject || null;
  if (input.body !== undefined) patch.body = input.body;
  if (input.toEmail !== undefined) patch.toEmail = input.toEmail || null;
  if (input.cc !== undefined) patch.cc = normalizeRecipients(input.cc);
  if (input.bcc !== undefined) patch.bcc = normalizeRecipients(input.bcc);
  if (input.scheduledAt !== undefined) {
    patch.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  }
  if (input.status !== undefined) {
    patch.status = input.status;
    // Stamp sentAt when the message leaves the queue as sent.
    if (input.status === "sent") patch.sentAt = new Date();
    // Scheduling: remember who scheduled it (the cron sends from their Gmail).
    if (input.status === "scheduled" && actingUserId) {
      patch.createdByUserId = actingUserId;
    }
    // Leaving the scheduled state (cancel / send / dismiss) clears the time.
    if (input.status !== "scheduled") patch.scheduledAt = null;
  }

  const [row] = await db
    .update(outboundMessage)
    .set(patch)
    .where(eq(outboundMessage.id, id))
    .returning({ id: outboundMessage.id });
  return row ?? null;
}
