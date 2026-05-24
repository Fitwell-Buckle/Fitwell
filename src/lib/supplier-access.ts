/**
 * Supplier portal sign-in policy.
 *
 * Suppliers sign in with a magic link (email). A sign-in is permitted when the
 * email maps to a supplier (its address is on that supplier's allowlist, so
 * `supplierId` resolves) OR the email is an allowed admin (admins may use the
 * link too — handy for support). Kept as a pure function so the policy can be
 * unit-tested without the DB or NextAuth.
 */
export function canMagicLinkSignIn(
  supplierId: string | null | undefined,
  adminAllowed: boolean,
): boolean {
  return !!supplierId || adminAllowed;
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
