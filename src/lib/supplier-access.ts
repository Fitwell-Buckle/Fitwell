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
