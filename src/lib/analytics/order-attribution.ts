import { db } from "@/lib/db";
import { customer, order, utmAttribution } from "@/lib/schema";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { captureEvent, identify } from "./posthog";
import type { ShopifyOrder } from "@/types/shopify";

/** Attribution window — keep in sync with specs/invariants/attribution.md §1. */
const ATTRIBUTION_WINDOW_DAYS = 30;

export type LinkMethod = "self_report" | "pixel" | "email_match";

/** Pull the identity-bridge distinct_id the Shopify pixel stamped on the cart. */
export function extractFwDistinctId(o: ShopifyOrder): string | null {
  const attrs = o.note_attributes ?? [];
  const hit = attrs.find((a) => a.name === "_fw_distinct_id");
  const val = hit?.value?.trim();
  return val ? val : null;
}

/**
 * Enrich the PostHog person with the purchase: identity stitch + a
 * `purchase_completed` event + first-touch UTMs. Shared by the pixel and
 * email_match paths so an email-matched conversion is just as visible in
 * PostHog as a pixel one. Callers guard on first-link (no re-emission on the
 * 2-hourly re-sync) and supply the distinct_id to attribute against.
 */
function enrichPersonWithPurchase(
  distinctId: string,
  shopifyOrder: ShopifyOrder,
  touch?: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
  },
): void {
  const email = shopifyOrder.email ?? undefined;
  identify(
    distinctId,
    {
      ...(email ? { email } : {}),
      last_order_at: shopifyOrder.processed_at ?? shopifyOrder.created_at,
    },
    {
      first_order_at: shopifyOrder.processed_at ?? shopifyOrder.created_at,
      ...(touch?.source ? { utm_source: touch.source } : {}),
      ...(touch?.medium ? { utm_medium: touch.medium } : {}),
      ...(touch?.campaign ? { utm_campaign: touch.campaign } : {}),
    },
  );
  captureEvent(distinctId, "purchase_completed", {
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
}

/**
 * Link a synced order to its pre-purchase attribution touch and, when a
 * distinct_id is available (pixel id on the cart, or one carried by the
 * matched touch), enrich the PostHog person with the purchase. Best-effort:
 * never throws into the caller (a webhook/cron), because attribution must not
 * break order ingestion.
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

    // The extract-shopify cron re-upserts a ~25h window every 2 hours, so
    // this function re-runs ~12×/day for every recent order. The DB-side
    // linking below is idempotent, but PostHog emission must fire only on
    // the FIRST link — unguarded, purchase_completed was inflated ~12× in
    // posthog_daily. A prior link also wins on method: self_report
    // (Grapevine) outranks pixel and must never be downgraded by a
    // re-sync (specs/invariants/attribution.md §4 hierarchy).
    const [existing] = await db
      .select({ linkMethod: order.linkMethod })
      .from(order)
      .where(eq(order.id, orderId))
      .limit(1);
    const priorLinkMethod = (existing?.linkMethod ?? null) as
      | LinkMethod
      | null;
    const firstLink = priorLinkMethod === null;

    // ── 1. Deterministic: pixel-carried distinct_id ──────────────────
    if (fwDistinctId) {
      linkMethod = priorLinkMethod === "self_report" ? "self_report" : "pixel";

      await db
        .update(order)
        .set({
          posthogDistinctId: fwDistinctId,
          ...(priorLinkMethod === "self_report"
            ? {}
            : { linkMethod: "pixel" as const }),
        })
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
      // First link only — see the re-sync note above.
      if (!firstLink) return { linkMethod };

      enrichPersonWithPurchase(fwDistinctId, shopifyOrder, touch);

      return { linkMethod };
    }

    // ── 2. Fallback: identity via the Shopify customer's prior touch ──
    // Lower confidence; only for orders with no pixel id (pre-pixel or
    // beacon blocked), and only when nothing has linked this order yet
    // (never overwrite self_report/pixel on a re-sync).
    // See specs/invariants/attribution.md §4.
    if (!firstLink) return { linkMethod: priorLinkMethod };
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
        const touchDistinctId = touch.posthogDistinctId ?? null;
        await db
          .update(order)
          .set({
            linkMethod,
            // Stamp the order with the touch's distinct_id so email-matched
            // conversions are no longer invisible to PostHog-side joins (this
            // was previously left null, the root of the email_match gap).
            ...(touchDistinctId ? { posthogDistinctId: touchDistinctId } : {}),
          })
          .where(eq(order.id, orderId));
        await db
          .update(utmAttribution)
          .set({ converted: true, convertedAt: new Date() })
          .where(eq(utmAttribution.id, touch.id));

        // Mirror the pixel path: emit purchase_completed so this conversion
        // counts in PostHog too. Only possible when the touch carried a
        // distinct_id (the anonymous id captured at touch time); a touch with
        // none still links the order, it just can't be attributed to a person.
        if (touchDistinctId) {
          if (customerId) {
            await db
              .update(customer)
              .set({
                posthogDistinctId: sql`COALESCE(${customer.posthogDistinctId}, ${touchDistinctId})`,
              })
              .where(eq(customer.id, customerId));
          }
          enrichPersonWithPurchase(touchDistinctId, shopifyOrder, touch);
        }
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
