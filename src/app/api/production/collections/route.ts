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
// A product can live in multiple collections (so a variant may appear under
// more than one group); products in no collection land in "Uncategorized".
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = getShopifyClient();
    const collections = (await client.getCollections()).slice(0, 250);

    const groups: CatalogGroup[] = [];
    const collectedProductIds = new Set<string>();

    for (const c of collections) {
      const products = await client.getCollectionProducts(c.id);
      const variants: CatalogVariant[] = [];
      for (const p of products) {
        const vs = variantsOf(p);
        if (vs.length) {
          collectedProductIds.add(String(p.id));
          variants.push(...vs);
        }
      }
      if (variants.length) {
        groups.push({ id: String(c.id), title: c.title, variants });
      }
    }

    // Sweep the full catalog so products in no collection stay selectable.
    const uncategorized: CatalogVariant[] = [];
    let pageInfo: string | undefined;
    for (let page = 0; page < 50; page++) {
      const { products, nextPageUrl } = await client.getProducts({
        limit: 250,
        page_info: pageInfo,
      });
      for (const p of products) {
        if (collectedProductIds.has(String(p.id))) continue;
        uncategorized.push(...variantsOf(p));
      }
      if (!nextPageUrl) break;
      pageInfo = nextPageUrl;
    }

    groups.sort((a, b) => a.title.localeCompare(b.title));
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
