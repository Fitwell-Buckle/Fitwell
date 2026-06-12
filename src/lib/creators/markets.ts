/**
 * Market gating for creators (2026-06-12, Tom): a big creator in a
 * country we don't ship to doesn't help us — sideline them, but bring
 * them back automatically the moment that market turns on.
 *
 * Source of truth = enabled Shopify Markets ∩ shipping-zone countries
 * (2026-06-12, Tom: Markets lists India but the shipping checkbox is
 * unchecked — a country needs BOTH to be sellable). The shipping read
 * needs the read_shipping scope (pending deploy); until granted we fall
 * back to markets-only. Cached for an hour. Fail-open: if Shopify is
 * unreachable we treat everyone as in-market — wrongly hiding creators
 * is worse than briefly showing out-of-market ones. Unknown country
 * (null) is always in-market.
 */

import { getShopifyClient } from "@/lib/shopify/client";

let cache: { codes: Set<string>; fetchedAt: number } | null = null;
const TTL_MS = 60 * 60 * 1000;

export async function getActiveMarkets(): Promise<Set<string> | null> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.codes;
  try {
    const client = getShopifyClient();
    const marketCodes = await client.getActiveMarketCountryCodes();
    if (marketCodes.length === 0) return null; // implausible — fail open

    let codes = new Set(marketCodes);
    try {
      const shipping = await client.getShippingCountryCodes();
      // null = a Rest-of-World zone (ships anywhere) → markets alone decide.
      if (shipping !== null) {
        const shippingSet = new Set(shipping);
        codes = new Set([...codes].filter((c) => shippingSet.has(c)));
      }
    } catch (e) {
      // read_shipping not granted yet (or transient) — markets-only.
      console.warn("Shipping-zone lookup unavailable, using markets only:", e);
    }

    cache = { codes, fetchedAt: Date.now() };
    return cache.codes;
  } catch (e) {
    console.error("Active-markets lookup failed (failing open):", e);
    return null;
  }
}

/** Pure check, testable: null markets (lookup failed) or null country → in-market. */
export function isOutOfMarket(
  country: string | null,
  activeMarkets: Set<string> | null,
): boolean {
  if (!country || !activeMarkets) return false;
  return !activeMarkets.has(country.toUpperCase());
}
