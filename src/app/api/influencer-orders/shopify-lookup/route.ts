import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { influencerOrder } from "@/lib/schema";
import { getShopifyClient } from "@/lib/shopify/client";
import { mapShopifyOrderToGift } from "@/lib/influencer/shopify-import";

// Preview an existing Shopify order by its number, for the "record existing
// order" flow — fetches line items + fulfillment (tracking/delivered) without
// writing anything. Admin-only.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const name = new URL(req.url).searchParams.get("name")?.trim();
  if (!name) {
    return NextResponse.json({ error: "Enter a Shopify order number." }, { status: 400 });
  }

  let order;
  try {
    order = await getShopifyClient().findOrderByName(name);
  } catch (err) {
    console.error("Shopify order lookup failed:", err);
    return NextResponse.json(
      { error: "Couldn't reach Shopify — try again." },
      { status: 502 },
    );
  }
  if (!order) {
    return NextResponse.json(
      { error: `No Shopify order found matching “${name}”.` },
      { status: 404 },
    );
  }

  const gift = mapShopifyOrderToGift(order);
  const existing = await db.query.influencerOrder.findFirst({
    where: eq(influencerOrder.shopifyOrderId, gift.shopifyOrderId),
    columns: { id: true, orderNumber: true },
  });

  return NextResponse.json({
    data: {
      shopifyOrderId: gift.shopifyOrderId,
      orderName: gift.orderName,
      lineItems: gift.lineItems,
      trackingNumber: gift.trackingNumber,
      trackingUrl: gift.trackingUrl,
      shippedAt: gift.shippedAt?.toISOString() ?? null,
      deliveredAt: gift.deliveredAt?.toISOString() ?? null,
      cancelled: gift.cancelled,
      alreadyImported: existing
        ? { id: existing.id, orderNumber: existing.orderNumber }
        : null,
    },
  });
}
