// Pure helpers for interpreting a Shopify order's tags. Shopify returns tags as
// a comma-separated string (REST + webhooks) or an array (GraphQL); we tolerate
// both, plus surrounding whitespace and mixed case.

/** Tags applied to free shipments (B2B samples + influencer gifts) so Shopify
 *  fulfillment ships them like any order. `sample` is the authoritative
 *  revenue-exclusion flag; `influencer-gift` additionally identifies gifting. */
export const GIFT_ORDER_TAGS = ["sample", "influencer-gift"] as const;

/** Normalize raw Shopify tags to a lowercased, trimmed, non-empty list. */
export function normalizeOrderTags(
  tags: string | string[] | null | undefined,
): string[] {
  if (!tags) return [];
  const arr = Array.isArray(tags) ? tags : tags.split(",");
  return arr.map((t) => t.trim().toLowerCase()).filter(Boolean);
}

/**
 * Whether an order carries the authoritative `sample` tag — the single signal
 * that keeps a $0 sample/gift order out of revenue & attribution. Matches the
 * exact tag only: "samples" (plural) or "sampler" do NOT count.
 */
export function hasSampleTag(
  tags: string | string[] | null | undefined,
): boolean {
  return normalizeOrderTags(tags).includes("sample");
}
