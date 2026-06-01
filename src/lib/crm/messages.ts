import { z } from "zod";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { lead, outboundMessage } from "@/lib/schema";

export const MESSAGE_STATUSES = ["draft", "sent", "dismissed"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export interface CreateOutboundMessageInput {
  leadId: string;
  toEmail?: string | null;
  subject?: string | null;
  body: string;
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
      toEmail: input.toEmail ?? null,
      subject: input.subject ?? null,
      body: input.body,
      generatedByModel: input.generatedByModel ?? null,
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning({ id: outboundMessage.id });
  return { id: row.id };
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
