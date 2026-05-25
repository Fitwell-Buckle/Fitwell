import { unstable_cache } from "next/cache";
import { getShopifyClient, toCents } from "@/lib/shopify/client";
import { deriveAttrs } from "./attrs";

export interface CatalogVariant {
  shopifyProductId: string;
  shopifyVariantId: string;
  sku: string;
  title: string;
  variantTitle: string | null;
  /** Shopify retail price in cents (basis for B2B invoice pricing). */
  priceCents: number;
  /** Buckle size in mm + colour, from the variant's Size / Colour options. */
  sizeMm: number | null;
  color: string | null;
}

/** Flattened active Shopify catalog with derived size/colour. */
export async function loadCatalog(): Promise<CatalogVariant[]> {
  const client = getShopifyClient();
  const variants: CatalogVariant[] = [];

  let pageInfo: string | undefined;
  for (let page = 0; page < 50; page++) {
    const { products, nextPageUrl } = await client.getProducts({
      limit: 250,
      page_info: pageInfo,
    });
    for (const p of products) {
      if (p.status && p.status !== "active") continue;
      const optionNames = (p.options ?? []).map((o) => o.name);
      for (const v of p.variants ?? []) {
        const { sizeMm, color } = deriveAttrs(optionNames, [
          v.option1,
          v.option2,
          v.option3,
        ]);
        variants.push({
          shopifyProductId: String(p.id),
          shopifyVariantId: String(v.id),
          sku: v.sku ?? "",
          title: p.title,
          variantTitle: v.title && v.title !== "Default Title" ? v.title : null,
          priceCents: toCents(v.price),
          sizeMm,
          color,
        });
      }
    }
    if (!nextPageUrl) break;
    pageInfo = nextPageUrl;
  }
  return variants;
}

/**
 * Cached catalog for server components that only need variant attributes
 * (e.g. the POs page size/colour filter), so they don't re-page Shopify on
 * every render. The picker still fetches live via /api/production/products.
 */
export const getCatalogCached = unstable_cache(loadCatalog, ["production-catalog"], {
  revalidate: 3600,
});
