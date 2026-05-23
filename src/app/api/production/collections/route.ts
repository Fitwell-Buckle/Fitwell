import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getShopifyClient } from "@/lib/shopify/client";
import type { ShopifyProduct } from "@/types/shopify";
import type { CatalogVariant } from "../products/route";

export interface CatalogGroup {
  id: string;
  title: string;
  variants: CatalogVariant[];
}

const UNCATEGORIZED_ID = "__uncategorized__";

function variantsOf(p: ShopifyProduct): CatalogVariant[] {
  if (p.status && p.status !== "active") return [];
  return (p.variants ?? []).map((v) => ({
    shopifyProductId: String(p.id),
    shopifyVariantId: String(v.id),
    sku: v.sku ?? "",
    title: p.title,
    variantTitle: v.title && v.title !== "Default Title" ? v.title : null,
  }));
}

// Catalog grouped by Shopify collection for the cascading PO line-item picker.
//
// In API 2025-01 the /collections/{id}/products.json endpoint returns products
// WITHOUT their variants, so we can't build variants from it directly. Instead
// we pull the full catalog from /products.json (which has variants) once, then
// use the per-collection endpoint only to learn which product IDs belong to
// each collection.
//
// A product can be in multiple collections (so a variant may appear under more
// than one group); products in no collection land in "Uncategorized".
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = getShopifyClient();

    // 1. Full catalog (with variants), indexed by product id.
    const variantsByProduct = new Map<string, CatalogVariant[]>();
    let pageInfo: string | undefined;
    for (let page = 0; page < 50; page++) {
      const { products, nextPageUrl } = await client.getProducts({
        limit: 250,
        page_info: pageInfo,
      });
      for (const p of products) {
        const vs = variantsOf(p);
        if (vs.length) variantsByProduct.set(String(p.id), vs);
      }
      if (!nextPageUrl) break;
      pageInfo = nextPageUrl;
    }

    // 2. Assemble each collection's variants from its member product IDs.
    const collections = (await client.getCollections()).slice(0, 250);
    const groups: CatalogGroup[] = [];
    const collectedProductIds = new Set<string>();

    for (const c of collections) {
      const members = await client.getCollectionProducts(c.id);
      const variants: CatalogVariant[] = [];
      for (const m of members) {
        const pid = String(m.id);
        const vs = variantsByProduct.get(pid);
        if (vs) {
          variants.push(...vs);
          collectedProductIds.add(pid);
        }
      }
      if (variants.length) {
        groups.push({ id: String(c.id), title: c.title, variants });
      }
    }

    groups.sort((a, b) => a.title.localeCompare(b.title));

    // 3. Products in no collection stay selectable under "Uncategorized".
    const uncategorized: CatalogVariant[] = [];
    for (const [pid, vs] of variantsByProduct) {
      if (!collectedProductIds.has(pid)) uncategorized.push(...vs);
    }
    if (uncategorized.length) {
      groups.push({ id: UNCATEGORIZED_ID, title: "Uncategorized", variants: uncategorized });
    }

    return NextResponse.json({ data: groups });
  } catch (err) {
    console.error("Fetch Shopify collections failed:", err);
    return NextResponse.json(
      { error: "Could not load Shopify collections" },
      { status: 502 },
    );
  }
}
