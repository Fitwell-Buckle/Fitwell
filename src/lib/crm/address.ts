// Mailing-address parts kept on a lead. All free-text so foreign /
// international formats fit (no fixed state/country picker).
export interface AddressParts {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null; // state / province / region
  postalCode: string | null;
  country: string | null;
}

// Render the parts as a readable multi-line block: street lines, then a
// "city, region postal" line, then country. Empty parts are skipped, and
// returns null when nothing is set (so callers can show a placeholder).
export function formatAddress(a: AddressParts): string | null {
  const cityLine = [a.city, a.region, a.postalCode]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(", ");
  const lines = [
    a.addressLine1?.trim(),
    a.addressLine2?.trim(),
    cityLine,
    a.country?.trim(),
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}
