import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { influencerOrder } from "@/lib/schema";
import { getShopifyClient } from "@/lib/shopify/client";
import { mapShopifyOrderToGift } from "@/lib/influencer/shopify-import";
import { recordInfluencerOrder } from "@/lib/influencer/service";

const schema = z.object({
  influencerId: z.string().min(1),
  orderName: z.string().min(1).max(50),
});

// Record an order that already exists in Shopify as a gifting order: re-fetch
// it by number, map its line items + fulfillment tracking, and persist (no new
// Shopify draft). Admin-only. 409 if it was already recorded.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  let order;
  try {
    order = await getShopifyClient().findOrderByName(parsed.data.orderName);
  } catch (err) {
    console.error("Shopify order lookup failed:", err);
    return NextResponse.json(
      { error: "Couldn't reach Shopify — try again." },
      { status: 502 },
    );
  }
  if (!order) {
    return NextResponse.json(
      { error: `No Shopify order found matching “${parsed.data.orderName}”.` },
      { status: 404 },
    );
  }

  const gift = mapShopifyOrderToGift(order);
  if (gift.lineItems.length === 0) {
    return NextResponse.json(
      { error: "That Shopify order has no line items to record." },
      { status: 400 },
    );
  }

  const existing = await db.query.influencerOrder.findFirst({
    where: eq(influencerOrder.shopifyOrderId, gift.shopifyOrderId),
    columns: { id: true, orderNumber: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: `That Shopify order is already recorded as ${existing.orderNumber}.`,
        data: { id: existing.id },
      },
      { status: 409 },
    );
  }

  try {
    const result = await recordInfluencerOrder({
      influencerId: parsed.data.influencerId,
      lineItems: gift.lineItems.map((l) => ({
        sku: l.sku,
        title: l.title,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        shopifyProductId: l.shopifyProductId,
        shopifyVariantId: l.shopifyVariantId,
      })),
      shopifyOrderId: gift.shopifyOrderId,
      trackingNumber: gift.trackingNumber,
      trackingUrl: gift.trackingUrl,
      shippedAt: gift.shippedAt,
      deliveredAt: gift.deliveredAt,
      notes: `Recorded from existing Shopify order ${gift.orderName}.`,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    console.error("Import Shopify gifting order failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
