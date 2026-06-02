import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adminNotification,
  customer,
  lead,
  supplier,
  whatsappMessage,
} from "@/lib/schema";
import { matchPhone, normalizePhone, type PhoneIndex } from "./phone-match";

// Build the phone→lead / customer / supplier index from stored records.
export async function buildPhoneIndex(): Promise<PhoneIndex> {
  const [leads, customers, suppliers] = await Promise.all([
    db.select({ id: lead.id, phone: lead.phone }).from(lead),
    db.select({ id: customer.id, phone: customer.phone }).from(customer),
    db.select({ id: supplier.id, phone: supplier.phone }).from(supplier),
  ]);
  const leadByPhone = new Map<string, string>();
  for (const l of leads) {
    const k = normalizePhone(l.phone);
    if (k) leadByPhone.set(k, l.id);
  }
  const customerByPhone = new Map<string, string>();
  for (const c of customers) {
    const k = normalizePhone(c.phone);
    if (k) customerByPhone.set(k, c.id);
  }
  const supplierByPhone = new Map<string, string>();
  for (const s of suppliers) {
    const k = normalizePhone(s.phone);
    if (k) supplierByPhone.set(k, s.id);
  }
  return { leadByPhone, customerByPhone, supplierByPhone };
}

// A WhatsApp message in the normalized shape the Messages views (lead /
// customer / supplier) consume, so the Gmail and WhatsApp channels merge into
// one Received/Sent list. No mailbox (single business line — no per-admin inbox)
// and no Gmail thread; `channel:"whatsapp"` drives the row's tag + the fact that
// it isn't openable/repliable as email.
export interface WhatsappReply {
  id: string;
  threadId: null;
  from: string;
  subject: null;
  snippet: string | null;
  dateMs: number;
  mailbox: null;
  mailboxEmail: null;
  to: null;
  channel: "whatsapp";
}

// WhatsApp messages for one contact (matched by phone at ingest, so keyed by the
// stored lead/customer/supplier id). `direction` maps to the Received/Sent
// toggle: received → inbound, sent → outbound. Undismissed, newest first.
export async function listWhatsappAsMessages(
  match: { leadId?: string; customerId?: string; supplierId?: string },
  direction: "received" | "sent",
): Promise<WhatsappReply[]> {
  const idCond = match.leadId
    ? eq(whatsappMessage.leadId, match.leadId)
    : match.customerId
      ? eq(whatsappMessage.customerId, match.customerId)
      : match.supplierId
        ? eq(whatsappMessage.supplierId, match.supplierId)
        : null;
  if (!idCond) return [];

  const dir = direction === "sent" ? "outbound" : "inbound";
  const rows = await db
    .select()
    .from(whatsappMessage)
    .where(
      and(
        idCond,
        eq(whatsappMessage.direction, dir),
        isNull(whatsappMessage.dismissedAt),
      ),
    )
    .orderBy(desc(whatsappMessage.receivedAt));

  return rows.map((r) => ({
    id: r.id,
    threadId: null,
    from:
      direction === "sent"
        ? `You → ${r.toPhone ?? r.contactName ?? "contact"} (WhatsApp)`
        : r.contactName
          ? `${r.contactName} (${r.fromPhone})`
          : r.fromPhone,
    subject: null,
    snippet: r.body,
    dateMs: r.receivedAt ? r.receivedAt.getTime() : 0,
    mailbox: null,
    mailboxEmail: null,
    to: null,
    channel: "whatsapp" as const,
  }));
}

export interface InboundWhatsApp {
  waMessageId: string;
  fromPhone: string;
  contactName?: string | null;
  body?: string | null;
  timestampSec?: number | null;
}

// Record an inbound WhatsApp message if it's from a known lead/customer, dedup
// on the WhatsApp message id, and raise a notification for genuinely new ones.
// Returns whether a new row was inserted. Unknown senders are ignored.
export async function recordInboundWhatsApp(
  msg: InboundWhatsApp,
  index?: PhoneIndex,
): Promise<{ inserted: boolean; matched: boolean }> {
  const idx = index ?? (await buildPhoneIndex());
  const match = matchPhone(msg.fromPhone, idx);
  if (!match) return { inserted: false, matched: false };

  const rows = await db
    .insert(whatsappMessage)
    .values({
      waMessageId: msg.waMessageId,
      direction: "inbound",
      fromPhone: msg.fromPhone,
      contactName: msg.contactName ?? null,
      body: msg.body ?? null,
      receivedAt: msg.timestampSec
        ? new Date(msg.timestampSec * 1000)
        : new Date(),
      leadId: match.leadId,
      customerId: match.customerId,
      supplierId: match.supplierId,
    })
    .onConflictDoNothing({ target: whatsappMessage.waMessageId })
    .returning({ id: whatsappMessage.id });

  if (rows.length === 0) return { inserted: false, matched: true };

  const who = msg.contactName || msg.fromPhone;
  const href = match.supplierId
    ? "/modules/production/suppliers"
    : match.customerId
      ? `/customers/${match.customerId}`
      : null;
  await db.insert(adminNotification).values({
    type: "whatsapp_message",
    title: `WhatsApp from ${who}`,
    body: msg.body ?? null,
    leadId: match.leadId,
    href,
    // Reuse the mailbox channel so the notifications inbox color-codes +
    // filters WhatsApp as its own channel chip.
    mailboxLabel: "WhatsApp",
  });

  return { inserted: true, matched: true };
}
