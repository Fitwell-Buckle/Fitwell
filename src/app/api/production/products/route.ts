import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadCatalog, type CatalogVariant } from "@/lib/catalog/load";

// Re-exported so existing importers keep working.
export type { CatalogVariant };

// Flattened Shopify catalog (active products only) for the product chooser.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const variants = await loadCatalog();
    return NextResponse.json({ data: variants });
  } catch (err) {
    console.error("Fetch Shopify catalog failed:", err);
    return NextResponse.json(
      { error: "Could not load the Shopify catalog" },
      { status: 502 },
    );
  }
}
