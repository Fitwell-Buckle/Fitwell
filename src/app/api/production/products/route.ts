import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCatalogCached, type CatalogVariant } from "@/lib/catalog/load";

// Re-exported so existing importers keep working.
export type { CatalogVariant };

// Flattened Shopify catalog for the product chooser. Includes active, draft, and
// unlisted (unpublished) products — only archived items are excluded.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const variants = await getCatalogCached();
    return NextResponse.json({ data: variants });
  } catch (err) {
    console.error("Fetch Shopify catalog failed:", err);
    return NextResponse.json(
      { error: "Could not load the Shopify catalog" },
      { status: 502 },
    );
  }
}
