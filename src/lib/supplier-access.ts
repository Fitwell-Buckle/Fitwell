/**
 * Magic-link (email) portal sign-in policy. A sign-in is permitted when the
 * email maps to a supplier (supplier allowlist) OR a company (company
 * allowlist) OR is an allowed admin (admins may use the link too — handy for
 * support). Pure so the policy can be unit-tested without the DB or NextAuth.
 */
export function canMagicLinkSignIn(
  supplierId: string | null | undefined,
  companyId: string | null | undefined,
  adminAllowed: boolean,
): boolean {
  return !!supplierId || !!companyId || adminAllowed;
}

/**
 * Resource-access policy for the supplier portal: may a session scoped to
 * `sessionSupplierId` act on a PO owned by `poSupplierId`? Only when both are
 * present and equal — a missing/blank id on either side is never a match, so a
 * supplier can never reach another supplier's (or an unassigned) PO. Pure so
 * the isolation rule can be unit-tested directly. (Admins bypass this — callers
 * only consult it for `role === "supplier"` sessions.)
 */
export function canSupplierAccessPo(
  poSupplierId: string | null | undefined,
  sessionSupplierId: string | null | undefined,
): boolean {
  return !!poSupplierId && !!sessionSupplierId && poSupplierId === sessionSupplierId;
}
