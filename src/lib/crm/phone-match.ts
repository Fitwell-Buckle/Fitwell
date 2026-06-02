// Match an inbound phone number (e.g. a WhatsApp sender) to a stored lead or
// customer. Pure + unit-tested; the DB lookups that build the index live in the
// whatsapp-messages service.

export interface PhoneIndex {
  // normalized phone -> lead id
  leadByPhone: Map<string, string>;
  // normalized phone -> customer id
  customerByPhone: Map<string, string>;
  // normalized phone -> supplier id
  supplierByPhone?: Map<string, string>;
}

export interface PhoneMatch {
  leadId: string | null;
  customerId: string | null;
  supplierId: string | null;
}

// Normalize a phone to a comparable key: digits only, last 10 (so a stored
// "+ 41 78 880 92 92" matches a WhatsApp "41788809292" regardless of how the
// country code / formatting is written). Returns null if too short to match.
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

// Lead wins, then supplier, then customer. Returns null when the number isn't a
// known contact — those inbound messages are ignored.
export function matchPhone(
  phone: string | null | undefined,
  index: PhoneIndex,
): PhoneMatch | null {
  const key = normalizePhone(phone);
  if (!key) return null;
  const leadId = index.leadByPhone.get(key);
  if (leadId) return { leadId, customerId: null, supplierId: null };
  const supplierId = index.supplierByPhone?.get(key);
  if (supplierId) return { leadId: null, customerId: null, supplierId };
  const customerId = index.customerByPhone.get(key);
  if (customerId) return { leadId: null, customerId, supplierId: null };
  return null;
}
