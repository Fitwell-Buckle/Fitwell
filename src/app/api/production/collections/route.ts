import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  loadCatalogCollections,
  type CatalogCollectionGroupFull,
} from "@/lib/catalog/load";

// Re-exported so existing importers (useCatalog) keep working.
export type CatalogGroup = CatalogCollectionGroupFull;

// Catalog grouped by Shopify collection (with full variants) for the product
// chooser. Served from the cached loader (1-hour catalog cache) so the chooser
// loads instantly instead of re-paging Shopify on every open. A product can be
// in multiple collections; products in none land in "Uncategorized".
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const groups = await loadCatalogCollections();
    return NextResponse.json({ data: groups });
  } catch (err) {
    console.error("Fetch Shopify collections failed:", err);
    return NextResponse.json(
      { error: "Could not load Shopify collections" },
      { status: 502 },
    );
  }
}
