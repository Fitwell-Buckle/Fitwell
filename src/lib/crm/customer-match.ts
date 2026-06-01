// Match an inbound email sender to a stored customer or B2B company by email
// address. Pure + unit-tested; the DB lookups that build the index live in the
// customer-messages service.

export interface CustomerEmailIndex {
  // lowercased email -> company id (B2B contact emails)
  companyByEmail: Map<string, string>;
  // lowercased email -> customer id (Shopify-synced consumers)
  customerByEmail: Map<string, string>;
  // lowercased email -> supplier id (supplier contact emails)
  supplierByEmail?: Map<string, string>;
}

export interface SenderMatch {
  audience: "b2b" | "consumer" | "supplier";
  companyId: string | null;
  customerId: string | null;
  supplierId: string | null;
  email: string;
  name: string | null;
}

// Pull a bare lowercased email out of a "Name <email>" From header (or a plain
// address). Returns null if there's no plausible address.
export function parseEmailAddress(fromHeader: string): string | null {
  if (!fromHeader) return null;
  const angle = fromHeader.match(/<([^>]+)>/);
  const email = (angle ? angle[1] : fromHeader).trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

// Pull the display name out of a "Name <email>" From header, if present.
export function parseDisplayName(fromHeader: string): string | null {
  if (!fromHeader) return null;
  const m = fromHeader.match(/^\s*"?([^"<]+?)"?\s*</);
  const name = m ? m[1].trim() : "";
  return name || null;
}

// Match a sender to a known customer. A company-contact match (B2B) wins over a
// plain customer (consumer) match. Returns null when the sender isn't a known
// customer — those inbound emails are ignored.
export function matchCustomerSender(
  fromHeader: string,
  index: CustomerEmailIndex,
): SenderMatch | null {
  const email = parseEmailAddress(fromHeader);
  if (!email) return null;
  const name = parseDisplayName(fromHeader);

  const companyId = index.companyByEmail.get(email);
  if (companyId) {
    return {
      audience: "b2b",
      companyId,
      customerId: null,
      supplierId: null,
      email,
      name,
    };
  }
  const supplierId = index.supplierByEmail?.get(email);
  if (supplierId) {
    return {
      audience: "supplier",
      companyId: null,
      customerId: null,
      supplierId,
      email,
      name,
    };
  }
  const customerId = index.customerByEmail.get(email);
  if (customerId) {
    return {
      audience: "consumer",
      companyId: null,
      customerId,
      supplierId: null,
      email,
      name,
    };
  }
  return null;
}
