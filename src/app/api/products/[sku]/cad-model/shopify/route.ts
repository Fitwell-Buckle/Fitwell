import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pushToShopify } from "@/lib/cad/products";

export const runtime = "nodejs";
export const maxDuration = 60;

// Push the SKU's linked CAD model to its Shopify product as native 3D media.
// Writes to the live storefront — admin-only, deliberate action.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sku: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { sku: encoded } = await params;
  const sku = decodeURIComponent(encoded);

  try {
    const { mediaId, status } = await pushToShopify(sku);
    return NextResponse.json({ data: { sku, mediaId, status } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Shopify push failed.";
    console.error("Shopify 3D media push failed:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
