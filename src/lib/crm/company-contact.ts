// Resolve a B2B company's displayed "Contact" from its attached People. Pure
// (no db) so it's shared by the list + detail and unit-tested.

export interface ContactPerson {
  kind: "lead" | "customer";
  id: string;
  label: string;
  email: string | null;
}

export interface ResolvedContact {
  name: string | null;
  email: string | null;
  // Where the contact came from — drives UI hints.
  source: "primary" | "only" | "free_text" | "none";
}

export interface CompanyContactFields {
  contactName: string | null;
  contactEmail: string | null;
  primaryContactKind: string | null;
  primaryContactId: string | null;
}

// Preference order: the designated Primary Contact person → the single attached
// person → the legacy free-text contact → nothing. With multiple people and no
// primary designated, we fall to free-text/none so the UI nudges picking one.
export function resolveCompanyContact(
  company: CompanyContactFields,
  people: ContactPerson[],
): ResolvedContact {
  if (company.primaryContactId) {
    const p = people.find(
      (x) =>
        x.id === company.primaryContactId &&
        x.kind === company.primaryContactKind,
    );
    if (p) return { name: p.label, email: p.email, source: "primary" };
  }
  if (people.length === 1) {
    return { name: people[0].label, email: people[0].email, source: "only" };
  }
  if (company.contactName || company.contactEmail) {
    return {
      name: company.contactName,
      email: company.contactEmail,
      source: "free_text",
    };
  }
  return { name: null, email: null, source: "none" };
}
