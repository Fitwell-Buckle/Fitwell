import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { CATALOG_CACHE_TAG } from "@/lib/catalog/load";

// Manually drop the cached Shopify catalog so the next load refetches it.
// Admin-only. (The catalog otherwise stays cached until a product/collection
// webhook fires or the 1-week fallback elapses.)
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  revalidateTag(CATALOG_CACHE_TAG);
  return NextResponse.json({ data: { refreshed: true } });
}
