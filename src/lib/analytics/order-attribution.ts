import { db } from "@/lib/db";
import { customer, order, utmAttribution } from "@/lib/schema";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { captureEvent, identify } from "./posthog";
import type { ShopifyOrder } from "@/types/shopify";

/** Attribution window — keep in sync with specs/invariants/attribution.md §1. */
const ATTRIBUTION_WINDOW_DAYS = 30;

export type LinkMethod = "pixel" | "email_match";

/** Pull the identity-bridge distinct_id the Shopify pixel stamped on the cart. */
export function extractFwDistinctId(o: ShopifyOrder): string | null {
  const attrs = o.note_attributes ?? [];
  const hit = attrs.find((a) => a.name === "_fw_distinct_id");
  const val = hit?.value?.trim();
  return val ? val : null;
}

/**
 * Link a synced order to its pre-purchase attribution touch and, when the
 * deterministic pixel id is present, enrich the PostHog person with the
 * purchase. Best-effort: never throws into the caller (a webhook/cron),
 * because attribution must not break order ingestion.
 *
 * Does NOT flush PostHog — the caller (webhook route / cron) owns the flush.
 */
export async function linkOrderToAttribution(
  orderId: string,
  customerId: string | null,
  shopifyOrder: ShopifyOrder,
): Promise<{ linkMethod: LinkMethod | null }> {
  try {
    const windowStart = new Date(
      Date.now() - ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const fwDistinctId = extractFwDistinctId(shopifyOrder);
    let linkMethod: LinkMethod | null = null;

    // ── 1. Deterministic: pixel-carried distinct_id ──────────────────
    if (fwDistinctId) {
      linkMethod = "pixel";

      await db
        .update(order)
        .set({ posthogDistinctId: fwDistinctId, linkMethod })
        .where(eq(order.id, orderId));

      if (customerId) {
        await db
          .update(customer)
          .set({
            posthogDistinctId: sql`COALESCE(${customer.posthogDistinctId}, ${fwDistinctId})`,
          })
          .where(eq(customer.id, customerId));
      }

      // Mark the most-recent in-window touch for this visitor as converted.
      const [touch] = await db
        .select()
        .from(utmAttribution)
        .where(
          and(
            eq(utmAttribution.posthogDistinctId, fwDistinctId),
            gte(utmAttribution.capturedAt, windowStart),
          ),
        )
        .orderBy(desc(utmAttribution.capturedAt))
        .limit(1);

      if (touch && !touch.converted) {
        // Also backfill visitor_id so the email_match fallback path
        // can resolve subsequent orders from this same customer (e.g.,
        // a different browser/device on a repeat purchase). The snippet
        // can't know the customer at write time — they're anonymous when
        // the touch is captured — so we stamp it here at link time.
        await db
          .update(utmAttribution)
          .set({
            converted: true,
            convertedAt: new Date(),
            ...(customerId ? { visitorId: customerId } : {}),
          })
          .where(eq(utmAttribution.id, touch.id));
      }

      // Enrich the PostHog person: identity stitch + purchase + first-touch.
      const email = shopifyOrder.email ?? undefined;
      identify(
        fwDistinctId,
        {
          ...(email ? { email } : {}),
          last_order_at: shopifyOrder.processed_at ?? shopifyOrder.created_at,
        },
        {
          first_order_at:
            shopifyOrder.processed_at ?? shopifyOrder.created_at,
          ...(touch?.source ? { utm_source: touch.source } : {}),
          ...(touch?.medium ? { utm_medium: touch.medium } : {}),
          ...(touch?.campaign ? { utm_campaign: touch.campaign } : {}),
        },
      );
      captureEvent(fwDistinctId, "purchase_completed", {
        order_id: shopifyOrder.id,
        order_number: shopifyOrder.order_number,
        order_value: Number(shopifyOrder.total_price),
        currency: shopifyOrder.currency,
        line_items: shopifyOrder.line_items?.map((li) => ({
          title: li.title,
          sku: li.sku,
          quantity: li.quantity,
        })),
        utm_source: touch?.source ?? null,
        utm_campaign: touch?.campaign ?? null,
      });

      return { linkMethod };
    }

    // ── 2. Fallback: identity via the Shopify customer's prior touch ──
    // Lower confidence; only for orders with no pixel id (pre-pixel or
    // beacon blocked). See specs/invariants/attribution.md §4.
    if (customerId) {
      const [touch] = await db
        .select()
        .from(utmAttribution)
        .where(
          and(
            eq(utmAttribution.visitorId, customerId),
            gte(utmAttribution.capturedAt, windowStart),
            isNull(utmAttribution.convertedAt),
          ),
        )
        .orderBy(desc(utmAttribution.capturedAt))
        .limit(1);

      if (touch) {
        linkMethod = "email_match";
        await db
          .update(order)
          .set({ linkMethod })
          .where(eq(order.id, orderId));
        await db
          .update(utmAttribution)
          .set({ converted: true, convertedAt: new Date() })
          .where(eq(utmAttribution.id, touch.id));
      }
    }

    return { linkMethod };
  } catch (err) {
    console.error(
      `linkOrderToAttribution failed for order ${orderId}:`,
      err instanceof Error ? err.message : err,
    );
    return { linkMethod: null };
  }
}
