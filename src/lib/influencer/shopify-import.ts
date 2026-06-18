/**
 * Map a Shopify order (fetched by number) into the shape needed to record it as
 * a gifting order — line items + fulfillment-derived tracking/shipped/delivered.
 * Pure (no db / no Shopify client) so it's unit-testable; the API route does the
 * fetch + persist around it.
 */

import type { ShopifyOrder } from "@/types/shopify";

export interface ShopifyGiftImportLine {
  sku: string;
  title: string;
  quantity: number;
  unitPriceCents: number;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
}

export interface ShopifyGiftImport {
  shopifyOrderId: string;
  orderName: string; // "#1234"
  lineItems: ShopifyGiftImportLine[];
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  orderedAt: Date | null;
  cancelled: boolean;
}

function moneyToCents(value: string | null | undefined): number {
  const n = Number.parseFloat(value ?? "0");
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function mapShopifyOrderToGift(order: ShopifyOrder): ShopifyGiftImport {
  const lineItems: ShopifyGiftImportLine[] = (order.line_items ?? []).map((l) => ({
    sku: l.sku ?? "",
    title: l.title,
    quantity: l.quantity,
    unitPriceCents: moneyToCents(l.price),
    shopifyProductId: l.product_id != null ? String(l.product_id) : null,
    shopifyVariantId: l.variant_id != null ? String(l.variant_id) : null,
  }));

  const fulfillments = order.fulfillments ?? [];
  // Earliest fulfillment = shipped.
  const shippedAt = fulfillments
    .map((f) => parseDate(f.created_at))
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  // Any fulfillment marked delivered → delivered (use its updated time).
  const delivered = fulfillments.find((f) => f.shipment_status === "delivered");
  const deliveredAt = delivered
    ? parseDate(delivered.updated_at) ?? shippedAt
    : null;
  // First fulfillment carrying a tracking number.
  const tracked = fulfillments.find(
    (f) => f.tracking_number || (f.tracking_numbers && f.tracking_numbers.length),
  );
  const trackingNumber =
    tracked?.tracking_number ?? tracked?.tracking_numbers?.[0] ?? null;
  const trackingUrl =
    tracked?.tracking_url ?? tracked?.tracking_urls?.[0] ?? null;

  return {
    shopifyOrderId: String(order.id),
    orderName: order.name ?? `#${order.order_number}`,
    lineItems,
    trackingNumber,
    trackingUrl,
    shippedAt,
    deliveredAt,
    orderedAt: parseDate(order.created_at),
    cancelled: Boolean(order.cancelled_at),
  };
}
