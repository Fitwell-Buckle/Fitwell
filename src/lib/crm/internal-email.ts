// Decide whether an email address is "internal" — i.e. one of us (a connected
// team mailbox, an admin allowlist address, or anyone on the same domain as
// those). Used to make sure the customer/lead message views only ever surface
// mail FROM the external contact, never our own replies. Pure + unit-tested.

export type InternalEmailMatcher = (
  email: string | null | undefined,
) => boolean;

// Build a matcher from seed addresses (connected mailbox emails + admin
// allowlist). Both the exact addresses and their domains count as internal, so
// any teammate on the company domain is treated as internal even if not seeded.
export function buildInternalEmailMatcher(
  seeds: (string | null | undefined)[],
): InternalEmailMatcher {
  const addresses = new Set<string>();
  const domains = new Set<string>();
  for (const s of seeds) {
    const lc = s?.trim().toLowerCase();
    if (!lc || !lc.includes("@")) continue;
    addresses.add(lc);
    const domain = lc.split("@")[1];
    if (domain) domains.add(domain);
  }
  return (email) => {
    const lc = email?.trim().toLowerCase();
    if (!lc || !lc.includes("@")) return false;
    if (addresses.has(lc)) return true;
    const domain = lc.split("@")[1];
    return domain ? domains.has(domain) : false;
  };
}
