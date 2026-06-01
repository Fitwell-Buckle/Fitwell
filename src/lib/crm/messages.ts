import { z } from "zod";
import { and, desc, eq, isNull, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { lead, outboundMessage } from "@/lib/schema";

export const MESSAGE_STATUSES = ["draft", "sent", "dismissed"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export interface CreateOutboundMessageInput {
  leadId: string;
  toEmail?: string | null;
  subject?: string | null;
  body: string;
  // 1 = initial follow-up, 2 = two-week nudge. Defaults to 1.
  sequenceStep?: number;
  generatedByModel?: string | null;
  createdByUserId?: string | null;
}

export async function createOutboundMessage(
  input: CreateOutboundMessageInput,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(outboundMessage)
    .values({
      leadId: input.leadId,
      sequenceStep: input.sequenceStep ?? 1,
      toEmail: input.toEmail ?? null,
      subject: input.subject ?? null,
      body: input.body,
      generatedByModel: input.generatedByModel ?? null,
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning({ id: outboundMessage.id });
  return { id: row.id };
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

// List messages joined with their lead's display fields. Defaults to the
// pending queue (status='draft'); pass status to view sent/dismissed.
export async function listOutboundMessages(filters: { status?: string } = {}) {
  const conds: SQL[] = [
    eq(outboundMessage.status, filters.status ?? "draft"),
  ];
  return db
    .select({
      id: outboundMessage.id,
      leadId: outboundMessage.leadId,
      channel: outboundMessage.channel,
      toEmail: outboundMessage.toEmail,
      subject: outboundMessage.subject,
      body: outboundMessage.body,
      status: outboundMessage.status,
      createdAt: outboundMessage.createdAt,
      sentAt: outboundMessage.sentAt,
      leadFirstName: lead.firstName,
      leadLastName: lead.lastName,
      leadCompanyName: lead.companyName,
    })
    .from(outboundMessage)
    .innerJoin(lead, eq(outboundMessage.leadId, lead.id))
    .where(and(...conds))
    .orderBy(desc(outboundMessage.createdAt));
}

export async function countDraftMessages(): Promise<number> {
  const rows = await db
    .select({ id: outboundMessage.id })
    .from(outboundMessage)
    .where(eq(outboundMessage.status, "draft"));
  return rows.length;
}

export const updateMessageSchema = z
  .object({
    subject: z.string().max(500).nullish(),
    body: z.string().max(20_000).optional(),
    toEmail: z.string().email().max(320).nullish().or(z.literal("")),
    status: z.enum(MESSAGE_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "no fields to update",
  });
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;

export async function updateOutboundMessage(
  id: string,
  input: UpdateMessageInput,
): Promise<{ id: string } | null> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.subject !== undefined) patch.subject = input.subject || null;
  if (input.body !== undefined) patch.body = input.body;
  if (input.toEmail !== undefined) patch.toEmail = input.toEmail || null;
  if (input.status !== undefined) {
    patch.status = input.status;
    // Stamp sentAt when the message leaves the queue as sent.
    if (input.status === "sent") patch.sentAt = new Date();
  }

  const [row] = await db
    .update(outboundMessage)
    .set(patch)
    .where(eq(outboundMessage.id, id))
    .returning({ id: outboundMessage.id });
  return row ?? null;
}
