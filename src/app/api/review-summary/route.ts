import { NextResponse } from "next/server";
import { getReviewSummary } from "@/lib/reviews/summary";

// Public marketing endpoint: shop-wide review rating + count, powering the
// storefront "review pill". Read-only aggregate (no PII, no auth). Consumed
// cross-origin by the Shopify storefront, so CORS is open. Cached at the edge
// for an hour — the review table only refreshes daily via the Judge.me extract.
export const revalidate = 3600;

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

export async function GET() {
  try {
    const summary = await getReviewSummary();
    return NextResponse.json({ data: summary }, { headers: HEADERS });
  } catch {
    return NextResponse.json(
      { error: "review summary unavailable" },
      { status: 500 },
    );
  }
}
