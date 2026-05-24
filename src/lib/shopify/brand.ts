import { unstable_cache } from "next/cache";
import { getShopifyClient } from "./client";

// Bundled logo, used until the Shopify brand logo is reachable.
export const FALLBACK_LOGO = "/images/fitwell-logo.png";

/**
 * Single source for the store logo across the app. Tries the Shopify brand
 * logo (cached ~1h so we don't refetch per render and a change in Shopify
 * propagates within the hour), falling back to the bundled logo. The brand
 * field needs an extra scope + store re-authorization to be reachable; until
 * then this returns the fallback.
 */
export const getStoreLogoUrl = unstable_cache(
  async (): Promise<string> => {
    try {
      const url = await getShopifyClient().getBrandLogoUrl();
      return url ?? FALLBACK_LOGO;
    } catch {
      return FALLBACK_LOGO;
    }
  },
  ["store-logo-url"],
  { revalidate: 3600 },
);
