/**
 * Admin authorization policy.
 *
 * This is the entire access-control surface for the dashboard: only emails on
 * the ADMIN_EMAILS allowlist may sign in. An empty allowlist means "allow
 * anyone" (used in local/dev where ADMIN_EMAILS is unset). Kept as a pure
 * function so the policy can be unit-tested without booting NextAuth.
 */
export function isAllowedAdmin(
  email: string | null | undefined,
  adminEmails: string[],
): boolean {
  if (adminEmails.length === 0) return true;
  return adminEmails.includes(email ?? "");
}
