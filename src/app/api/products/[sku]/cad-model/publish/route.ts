import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { publishToWebsite, unpublishFromWebsite } from "@/lib/cad/products";

// Publish the SKU's linked CAD model to the public in-app 3D viewer.
// (Shopify product-media push is wired separately — it writes to the live
// storefront and is gated on a scope check.)
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
    const { glbUrl } = await publishToWebsite(sku);
    return NextResponse.json({ data: { sku, glbUrl } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
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
  await unpublishFromWebsite(sku);
  return NextResponse.json({ data: { sku } });
}
