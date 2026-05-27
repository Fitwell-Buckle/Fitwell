// Uniqueness checks for B2B customers (companies). A B2B customer's name and
// contact email must each be unique across companies — enforced at the API so
// both the "Add B2B customer" form and the PO inline-add flow surface a clear
// message. Comparison is case-insensitive and trimmed.

export interface CompanyIdentity {
  id: string;
  name: string;
  contactEmail: string | null;
}

export type CompanyConflictField = "name" | "email";

const norm = (s: string | null | undefined): string =>
  (s ?? "").trim().toLowerCase();

/**
 * Returns which field collides with an existing company, or null if clear.
 * Only fields present on `candidate` are checked (so a partial edit that omits
 * a field doesn't false-positive). `excludeId` skips the row being edited.
 * Name takes priority over email when both collide.
 */
export function detectCompanyConflict(
  candidate: { name?: string | null; contactEmail?: string | null },
  existing: CompanyIdentity[],
  excludeId?: string,
): CompanyConflictField | null {
  const others = existing.filter((c) => c.id !== excludeId);

  const name = norm(candidate.name);
  if (name && others.some((c) => norm(c.name) === name)) {
    return "name";
  }

  const email = norm(candidate.contactEmail);
  if (email && others.some((c) => norm(c.contactEmail) === email)) {
    return "email";
  }

  return null;
}

export function companyConflictMessage(
  field: CompanyConflictField,
  value: string,
): string {
  return field === "name"
    ? `A B2B customer named "${value}" already exists.`
    : `A B2B customer with the email ${value} already exists.`;
}
