import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { influencer } from "@/lib/schema";
import {
  createOrderSchema,
  recordInfluencerOrder,
  buildGiftDraftOrder,
} from "@/lib/influencer/service";
import { resolveInfluencerOrderShipTos } from "@/lib/portal/addresses";

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

  // Resolve the chosen saved-address ids (order-level + per-line split) into
  // stable snapshots against the influencer's linked Shopify customer.
  const { orderShipTo, lineShipTos } = await resolveInfluencerOrderShipTos(
    input.influencerId,
    input.addressId ?? undefined,
    input.lineItems.map((l) => l.addressId ?? undefined),
  );
  const resolvedLines = input.lineItems.map((l, i) => ({
    sku: l.sku,
    title: l.title,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    shopifyProductId: l.shopifyProductId ?? null,
    shopifyVariantId: l.shopifyVariantId ?? null,
    shipTo: lineShipTos[i],
  }));

  // Try to create the Shopify draft order at 100% off (gifting) via the shared
  // helper, so create + send build the gifting draft identically.
  let draft: { draftOrderId: string; invoiceUrl: string | null } | null = null;
  let warning: string | undefined;
  try {
    draft = await buildGiftDraftOrder({
      email: inf.contactEmail ?? null,
      shopifyCustomerId: inf.customer?.shopifyId ?? null,
      influencerName: inf.name,
      lineItems: resolvedLines,
      shipTo: orderShipTo ?? null,
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
      lineItems: resolvedLines,
      shipTo: orderShipTo ?? null,
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
