import { db } from "@/lib/db";
import { adminNotification, customer, lead, whatsappMessage } from "@/lib/schema";
import { matchPhone, normalizePhone, type PhoneIndex } from "./phone-match";

// Build the phone→lead / phone→customer index from stored records.
export async function buildPhoneIndex(): Promise<PhoneIndex> {
  const [leads, customers] = await Promise.all([
    db.select({ id: lead.id, phone: lead.phone }).from(lead),
    db.select({ id: customer.id, phone: customer.phone }).from(customer),
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
  return { leadByPhone, customerByPhone };
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
    })
    .onConflictDoNothing({ target: whatsappMessage.waMessageId })
    .returning({ id: whatsappMessage.id });

  if (rows.length === 0) return { inserted: false, matched: true };

  const who = msg.contactName || msg.fromPhone;
  await db.insert(adminNotification).values({
    type: "whatsapp_message",
    title: `WhatsApp from ${who}`,
    body: msg.body ?? null,
    leadId: match.leadId,
    href: match.customerId ? `/customers/${match.customerId}` : null,
    // Reuse the mailbox channel so the notifications inbox color-codes +
    // filters WhatsApp as its own channel chip.
    mailboxLabel: "WhatsApp",
  });

  return { inserted: true, matched: true };
}
