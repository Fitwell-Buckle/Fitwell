/**
 * Creator discount-code naming. Default shape: handle, uppercased,
 * non-alphanumerics stripped, + the percent (e.g. @watch.henry at 15% →
 * "WATCHHENRY15"). Pure — unit-tested; the API route owns uniqueness
 * (Shopify rejects duplicate codes, and creator_discount_code.code is a
 * unique index on the normalized form).
 */

export function defaultCreatorCode(handle: string, percentOff: number): string {
  const base = handle
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 18); // keep codes typeable
  return `${base || "CREATOR"}${Math.round(percentOff)}`;
}

/** Normalized form used for joins against order_discount_code.code. */
export function normalizeCode(code: string): string {
  return code.trim().toLowerCase();
}
