import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { influencerOrder } from "@/lib/schema";
import {
  updateInfluencerOrder,
  updateOrderSchema,
  saveInfluencerOrderLines,
  editOrderLineSchema,
} from "@/lib/influencer/service";
import { resolveInfluencerOrderShipTos } from "@/lib/portal/addresses";

// PATCH accepts metadata edits (deadline / published / affiliate / status /
// logistics — the tracking-table inline edits) AND, from the detail edit page,
// a full line-item replacement with split-fulfillment ship-to ids. Both are
// optional so either surface can send just what it changed.
const patchSchema = updateOrderSchema.extend({
  lineItems: z.array(editOrderLineSchema).min(1).optional(),
  // Order-level default ship-to address id (a saved address). null = clear.
  addressId: z.string().max(200).nullish(),
});

// Edit a gifting order. Admin-only.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let input;
  try {
    input = patchSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  const { lineItems, addressId, ...meta } = input;
  if (lineItems === undefined && Object.keys(meta).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    // Line edits: resolve the chosen saved-address ids to stable snapshots
    // (against the influencer's linked Shopify customer) before persisting.
    if (lineItems) {
      const ord = await db.query.influencerOrder.findFirst({
        where: eq(influencerOrder.id, id),
        columns: { id: true, influencerId: true },
      });
      if (!ord) return NextResponse.json({ error: "Not found" }, { status: 404 });

      const { orderShipTo, lineShipTos } = await resolveInfluencerOrderShipTos(
        ord.influencerId,
        addressId ?? undefined,
        lineItems.map((l) => l.addressId ?? undefined),
      );
      const resolvedLines = lineItems.map((l, i) => ({
        sku: l.sku,
        title: l.title,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        shopifyProductId: l.shopifyProductId ?? null,
        shopifyVariantId: l.shopifyVariantId ?? null,
        shipTo: lineShipTos[i],
      }));
      const res = await saveInfluencerOrderLines(id, {
        lineItems: resolvedLines,
        shipTo: orderShipTo,
      });
      if (!res.ok) {
        return NextResponse.json({ error: res.error }, { status: res.status });
      }
    }

    // Metadata edits (may be empty when only lines changed).
    if (Object.keys(meta).length > 0) {
      const updated = await updateInfluencerOrder(id, meta);
      if (!updated) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    return NextResponse.json({ data: { id } });
  } catch (err) {
    console.error("Update influencer order failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Hard delete. Schema FK cascade removes line items with the gifting order.
// Admin-only. The Shopify gifting draft order (if pushed) is NOT auto-revoked.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const [deleted] = await db
      .delete(influencerOrder)
      .where(eq(influencerOrder.id, id))
      .returning({ id: influencerOrder.id });
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: deleted.id } });
  } catch (err) {
    console.error("Delete influencer order failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
