import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { influencer } from "@/lib/schema";
import { getCatalogCached } from "@/lib/catalog/load";
import { getShopifyClient } from "@/lib/shopify/client";
import {
  createOrderSchema,
  recordInfluencerOrder,
} from "@/lib/influencer/service";
import { GIFT_DISCOUNT_PERCENT } from "@/lib/influencer/influencer";

function isScopeError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("write_draft_orders") || m.includes("access denied") || m.includes("403");
}

// Create an influencer gifting order: push a Shopify draft order at 100% off,
// then record it with content-deadline + affiliate-link tracking. If the
// Shopify push fails (e.g. missing scope) the order is still recorded as a
// draft so the deadline tracking is never lost — the response carries a
// warning. Admin-only.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let input;
  try {
    input = createOrderSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  const inf = await db.query.influencer.findFirst({
    where: eq(influencer.id, input.influencerId),
    columns: { id: true, name: true, contactEmail: true },
    with: { customer: { columns: { shopifyId: true } } },
  });
  if (!inf) {
    return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
  }

  // Try to create the Shopify draft order at 100% off (gifting). Resolve each
  // line's variant against the catalog for the live Shopify variant link.
  let draft: { draftOrderId: string; invoiceUrl: string | null } | null = null;
  let warning: string | undefined;
  try {
    const catalog = await getCatalogCached();
    const byVariant = new Map(catalog.map((v) => [v.shopifyVariantId, v]));
    draft = await getShopifyClient().createDraftOrderInvoice({
      email: inf.contactEmail ?? null,
      shopifyCustomerId: inf.customer?.shopifyId ?? null,
      discountPercent: GIFT_DISCOUNT_PERCENT,
      discountTitle: "Influencer gifting",
      note: `Influencer gifting — ${inf.name}`,
      lines: input.lineItems.map((l) => ({
        variantId:
          l.shopifyVariantId && byVariant.has(l.shopifyVariantId)
            ? l.shopifyVariantId
            : null,
        title: l.title,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (isScopeError(message)) {
      warning =
        "Order saved, but the Shopify draft order couldn't be created yet (the write_draft_orders scope isn't enabled).";
    } else {
      warning = "Order saved, but pushing the Shopify draft order failed — you can retry later.";
      console.error("Influencer draft order failed:", err);
    }
  }

  try {
    const order = await recordInfluencerOrder({
      influencerId: input.influencerId,
      lineItems: input.lineItems,
      contentDueDate: input.contentDueDate ?? null,
      affiliateLink: input.affiliateLink || null,
      notes: input.notes ?? null,
      issuedDate: input.issuedDate,
      shopifyDraftOrderId: draft?.draftOrderId ?? null,
      shopifyInvoiceUrl: draft?.invoiceUrl ?? null,
    });
    return NextResponse.json(
      {
        data: {
          id: order.id,
          orderNumber: order.orderNumber,
          payUrl: draft?.invoiceUrl ?? null,
        },
        warning,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("Record influencer order failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
