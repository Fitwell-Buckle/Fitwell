/**
 * Sample logistics sync (creator lifecycle chunk 1): connect gifting
 * draft orders to the real Shopify orders they become, and stamp
 * shipped/delivered from fulfillment data — "did samples ship, did they
 * land" answered by Shopify, not by memory.
 *
 * Called from the orders/create + orders/updated webhook path. Cheap for
 * non-gift orders: one indexed lookup, plus a single GraphQL call only
 * for draft-sourced orders that aren't linked yet.
 */

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { influencerOrder } from "@/lib/schema";
import { getShopifyClient } from "@/lib/shopify/client";

interface WebhookFulfillment {
  created_at?: string;
  shipment_status?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  updated_at?: string;
}

interface OrderWebhookPayload {
  id?: number | string;
  source_name?: string;
  fulfillments?: WebhookFulfillment[];
}

function parseDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function syncGiftOrderLogistics(
  payload: OrderWebhookPayload,
): Promise<void> {
  if (payload.id == null) return;
  const shopifyOrderId = String(payload.id);

  // Already linked?
  let gift = await db.query.influencerOrder.findFirst({
    where: eq(influencerOrder.shopifyOrderId, shopifyOrderId),
    columns: { id: true, shippedAt: true, deliveredAt: true },
  });

  // Not linked: only draft-sourced orders can be gifts, and only if any
  // gifting order is still waiting for its real-order link.
  if (!gift && payload.source_name === "shopify_draft_order") {
    const waiting = await db.query.influencerOrder.findFirst({
      where: and(
        isNotNull(influencerOrder.shopifyDraftOrderId),
        isNull(influencerOrder.shopifyOrderId),
      ),
      columns: { id: true },
    });
    if (!waiting) return;

    const draftGid = await getShopifyClient().getOrderDraftOrderId(shopifyOrderId);
    if (!draftGid) return;
    const match = await db.query.influencerOrder.findFirst({
      where: eq(influencerOrder.shopifyDraftOrderId, draftGid),
      columns: { id: true, shippedAt: true, deliveredAt: true },
    });
    if (!match) return;
    await db
      .update(influencerOrder)
      .set({ shopifyOrderId, updatedAt: new Date() })
      .where(eq(influencerOrder.id, match.id));
    gift = match;
  }

  if (!gift) return;

  const fulfillments = payload.fulfillments ?? [];
  if (fulfillments.length === 0) return;

  const firstShipped = fulfillments
    .map((f) => parseDate(f.created_at))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const delivered = fulfillments.find((f) => f.shipment_status === "delivered");
  const tracked = fulfillments.find((f) => f.tracking_number);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  // Stamp-once semantics: webhooks fill blanks, never overwrite a manual edit.
  if (firstShipped && !gift.shippedAt) updates.shippedAt = firstShipped;
  if (delivered && !gift.deliveredAt) {
    updates.deliveredAt = parseDate(delivered.updated_at) ?? new Date();
  }
  if (tracked) {
    updates.trackingNumber = tracked.tracking_number;
    updates.trackingUrl = tracked.tracking_url ?? null;
  }
  if (Object.keys(updates).length > 1) {
    await db
      .update(influencerOrder)
      .set(updates)
      .where(eq(influencerOrder.id, gift.id));
  }
}
