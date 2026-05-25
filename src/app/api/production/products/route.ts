import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getShopifyClient, toCents } from "@/lib/shopify/client";

export interface CatalogVariant {
  shopifyProductId: string;
  shopifyVariantId: string;
  sku: string;
  title: string;
  variantTitle: string | null;
  /** Shopify retail price in cents (basis for B2B invoice pricing). */
  priceCents: number;
}

// Flattened Shopify catalog (active products only) for the PO line-item picker.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = getShopifyClient();
    const variants: CatalogVariant[] = [];

    // Page through the catalog via Link-header pagination. Capped so a
    // misbehaving cursor can't loop forever.
    let pageInfo: string | undefined;
    for (let page = 0; page < 50; page++) {
      const { products, nextPageUrl } = await client.getProducts({
        limit: 250,
        page_info: pageInfo,
      });
      for (const p of products) {
        if (p.status && p.status !== "active") continue;
        for (const v of p.variants ?? []) {
          variants.push({
            shopifyProductId: String(p.id),
            shopifyVariantId: String(v.id),
            sku: v.sku ?? "",
            title: p.title,
            variantTitle: v.title && v.title !== "Default Title" ? v.title : null,
            priceCents: toCents(v.price),
          });
        }
      }
      if (!nextPageUrl) break;
      pageInfo = nextPageUrl;
    }

    return NextResponse.json({ data: variants });
  } catch (err) {
    console.error("Fetch Shopify catalog failed:", err);
    return NextResponse.json(
      { error: "Could not load the Shopify catalog" },
      { status: 502 },
    );
  }
}
