import { db } from "@/lib/db";
import {
  customer,
  customerAddress,
  order,
  orderDiscountCode,
  orderLineItem,
  orderRefundLine,
  shipment,
  utmAttribution,
} from "@/lib/schema";
import { getShopifyClient, toCents } from "./client";
import { hasSampleTag } from "./order-tags";
import { eq, sql } from "drizzle-orm";
import { linkOrderToAttribution } from "@/lib/analytics/order-attribution";
import type {
  ShopifyAddress,
  ShopifyCustomer,
  ShopifyOrder,
} from "@/types/shopify";

export function parseUtmParams(
  landingSite: string | null,
): Record<string, string> {
  if (!landingSite) return {};
  try {
    const url = new URL(landingSite, "https://fitwellbuckle.co");
    const params: Record<string, string> = {};
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      const val = url.searchParams.get(key);
      if (val) params[key] = val;
    }
    return params;
  } catch {
    return {};
  }
}

// ── Customer upsert ─────────────────────────────────────────────────

export async function upsertCustomer(
  shopifyCustomer: ShopifyCustomer,
): Promise<string> {
  const shopifyId = String(shopifyCustomer.id);
  const tags = shopifyCustomer.tags
    ? shopifyCustomer.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const values = {
    shopifyId,
    email: shopifyCustomer.email,
    firstName: shopifyCustomer.first_name,
    lastName: shopifyCustomer.last_name,
    phone: shopifyCustomer.phone,
    totalSpent: toCents(shopifyCustomer.total_spent),
    orderCount: shopifyCustomer.orders_count,
    tags,
    createdAt: new Date(shopifyCustomer.created_at),
    updatedAt: new Date(),
  };

  const [result] = await db
    .insert(customer)
    .values(values)
    .onConflictDoUpdate({
      target: customer.shopifyId,
      set: {
        email: values.email,
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        totalSpent: values.totalSpent,
        orderCount: values.orderCount,
        tags: values.tags,
        updatedAt: values.updatedAt,
        // Set firstOrderAt only if not already set and customer has orders
        firstOrderAt:
          shopifyCustomer.orders_count > 0
            ? sql`COALESCE(${customer.firstOrderAt}, ${values.createdAt})`
            : sql`${customer.firstOrderAt}`,
      },
    })
    .returning({ id: customer.id });

  // Address sync is best-effort — a bad address must NOT fail the whole customer
  // upsert (which would also fail every order that upserts this customer first,
  // silently stalling the dashboard). Log and continue.
  try {
    await syncCustomerAddresses(result.id, shopifyCustomer);
  } catch (err) {
    console.error(
      `syncCustomerAddresses failed for customer ${shopifyId}:`,
      err instanceof Error ? err.message : err,
    );
  }

  return result.id;
}

/**
 * Delete-and-replace sync of a customer's addresses from a Shopify payload.
 *
 * Shopify is the source of truth, and the payload's `addresses` array is
 * authoritative — if Shopify removed an address, we remove it locally too.
 * Falls back to `default_address` alone when the full array isn't present
 * (e.g. older sync paths). No-op when neither is present.
 */
async function syncCustomerAddresses(
  customerId: string,
  shopifyCustomer: ShopifyCustomer,
): Promise<void> {
  const fromPayload: ShopifyAddress[] =
    shopifyCustomer.addresses && shopifyCustomer.addresses.length > 0
      ? shopifyCustomer.addresses
      : shopifyCustomer.default_address
        ? [{ ...shopifyCustomer.default_address, default: true }]
        : [];

  if (fromPayload.length === 0) return;

  // Identify the default address by Shopify's `default_address.id` when the
  // entries don't carry a `default` flag themselves.
  const defaultId = shopifyCustomer.default_address?.id;

  const rows = fromPayload.map((a) => ({
    customerId,
    shopifyAddressId: a.id != null ? String(a.id) : null,
    firstName: a.first_name ?? null,
    lastName: a.last_name ?? null,
    company: a.company ?? null,
    address1: a.address1 ?? null,
    address2: a.address2 ?? null,
    city: a.city ?? null,
    province: a.province ?? null,
    provinceCode: a.province_code ?? null,
    country: a.country ?? null,
    countryCode: a.country_code ?? null,
    zip: a.zip ?? null,
    phone: a.phone ?? null,
    isDefault:
      a.default === true || (defaultId != null && a.id === defaultId),
    updatedAt: new Date(),
  }));

  // NOTE: the `db` here is the neon-http driver (see lib/db.ts), which does NOT
  // support interactive `db.transaction()` — calling it throws, and since this
  // whole function is wrapped in a best-effort try/catch in upsertCustomer, that
  // failure is swallowed and addresses silently never persist. Use `db.batch`,
  // which neon-http runs as a single atomic transaction over one HTTP round-trip.
  await db.batch([
    db.delete(customerAddress).where(eq(customerAddress.customerId, customerId)),
    db.insert(customerAddress).values(rows),
  ]);
}

// ── Order upsert ────────────────────────────────────────────────────

/**
 * Returns value on an order, in cents — what Shopify subtracts as "Returns"
 * when computing net/total sales. This is the *value of returned merchandise*,
 * not the cash moved: `refund_line_items` (item subtotal + tax) plus
 * `order_adjustments` (e.g. refunded shipping). Using cash `transactions`
 * undercounts returns settled via store credit or exchange.
 *
 * Clamped to the order total so inconsistent source data (recorded refunds that
 * exceed the order) can never push an order's net sales below zero.
 */
export function sumRefundedCents(shopifyOrder: ShopifyOrder): number {
  let cents = 0;
  for (const refund of shopifyOrder.refunds ?? []) {
    for (const li of refund.refund_line_items ?? []) {
      cents += toCents(li.subtotal) + toCents(li.total_tax ?? "0");
    }
    for (const adj of refund.order_adjustments ?? []) {
      // Adjustments (e.g. refunded shipping) are typically negative — take magnitude.
      cents += Math.abs(toCents(adj.amount)) + Math.abs(toCents(adj.tax_amount ?? "0"));
    }
  }
  const total = toCents(shopifyOrder.total_price);
  return Math.min(Math.max(0, cents), total);
}

/**
 * Flattens Shopify's refunds[].refund_line_items[] into per-product return rows
 * for the order_refund_line table. One row per refunded line item, carrying the
 * returned product's identity, unit count, value, and the refund date. Shipping
 * refunds (`order_adjustments`) are intentionally excluded — they aren't product
 * returns — but remain folded into order.total_refunded via sumRefundedCents().
 */
export function refundLineRows(shopifyOrder: ShopifyOrder, orderId: string) {
  const rows: Array<typeof orderRefundLine.$inferInsert> = [];
  for (const refund of shopifyOrder.refunds ?? []) {
    const refundedAt = refund.created_at ? new Date(refund.created_at) : null;
    for (const li of refund.refund_line_items ?? []) {
      rows.push({
        orderId,
        shopifyRefundId: String(refund.id),
        shopifyLineItemId:
          li.line_item_id != null ? String(li.line_item_id) : null,
        shopifyProductId:
          li.line_item?.product_id != null
            ? String(li.line_item.product_id)
            : null,
        shopifyVariantId:
          li.line_item?.variant_id != null
            ? String(li.line_item.variant_id)
            : null,
        title: li.line_item?.title ?? null,
        variantTitle: li.line_item?.variant_title ?? null,
        sku: li.line_item?.sku ?? null,
        quantity: li.quantity ?? 0,
        subtotalCents: toCents(li.subtotal),
        taxCents: toCents(li.total_tax ?? "0"),
        refundedAt,
      });
    }
  }
  return rows;
}

/**
 * Per-order shipping destination, snapshotted from the order's shipping_address.
 * Null fields when the order has no shipping address (digital/pickup/legacy).
 */
export function shippingFields(shopifyOrder: ShopifyOrder) {
  const a = shopifyOrder.shipping_address;
  return {
    shippingCity: a?.city ?? null,
    shippingProvince: a?.province ?? null,
    shippingProvinceCode: a?.province_code ?? null,
    shippingCountry: a?.country ?? null,
    shippingCountryCode: a?.country_code ?? null,
  };
}

export async function upsertOrder(shopifyOrder: ShopifyOrder): Promise<string> {
  // Upsert the customer first if present
  let customerId: string | null = null;
  if (shopifyOrder.customer) {
    customerId = await upsertCustomer(shopifyOrder.customer);
  }

  const shopifyId = String(shopifyOrder.id);
  const utm = parseUtmParams(shopifyOrder.landing_site);

  // Detect re-syncs before the upsert: the order-derived utm_attribution
  // insert below must fire only for NEW orders. Unguarded, the 2h cron's
  // 25h overlap window re-inserted an identical touch row on every pass
  // (one visitor accumulated 194 dupes; cleanup:
  // scripts/cleanup-utm-duplicate-touches.ts).
  const [preExisting] = await db
    .select({ id: order.id })
    .from(order)
    .where(eq(order.shopifyId, shopifyId))
    .limit(1);
  const isNewOrder = !preExisting;
  const orderValues = {
    shopifyId,
    shopifyOrderNumber: shopifyOrder.order_number,
    customerId,
    totalPrice: toCents(shopifyOrder.total_price),
    subtotalPrice: toCents(shopifyOrder.subtotal_price),
    totalTax: toCents(shopifyOrder.total_tax),
    totalDiscounts: toCents(shopifyOrder.total_discounts),
    totalShipping: toCents(
      shopifyOrder.total_shipping_price_set?.shop_money?.amount ?? "0",
    ),
    totalRefunded: sumRefundedCents(shopifyOrder),
    currency: shopifyOrder.currency,
    financialStatus: shopifyOrder.financial_status,
    fulfillmentStatus: shopifyOrder.fulfillment_status,
    sourceName: shopifyOrder.source_name,
    landingSite: shopifyOrder.landing_site,
    referringSite: shopifyOrder.referring_site,
    ...shippingFields(shopifyOrder),
    processedAt: shopifyOrder.processed_at
      ? new Date(shopifyOrder.processed_at)
      : new Date(shopifyOrder.created_at),
    cancelledAt: shopifyOrder.cancelled_at
      ? new Date(shopifyOrder.cancelled_at)
      : null,
    // Tag-driven: a $0 sample/influencer-gift order carries the `sample` tag,
    // which keeps it out of revenue/attribution. Re-derived on every sync, so
    // removing the tag in Shopify re-includes the order. See order-tags.ts +
    // b2b-samples-system.md.
    isSample: hasSampleTag(shopifyOrder.tags),
    updatedAt: new Date(),
  };

  const [result] = await db
    .insert(order)
    .values(orderValues)
    .onConflictDoUpdate({
      target: order.shopifyId,
      set: {
        shopifyOrderNumber: orderValues.shopifyOrderNumber,
        customerId: orderValues.customerId,
        totalPrice: orderValues.totalPrice,
        subtotalPrice: orderValues.subtotalPrice,
        totalTax: orderValues.totalTax,
        totalDiscounts: orderValues.totalDiscounts,
        totalShipping: orderValues.totalShipping,
        totalRefunded: orderValues.totalRefunded,
        currency: orderValues.currency,
        financialStatus: orderValues.financialStatus,
        fulfillmentStatus: orderValues.fulfillmentStatus,
        sourceName: orderValues.sourceName,
        landingSite: orderValues.landingSite,
        referringSite: orderValues.referringSite,
        shippingCity: orderValues.shippingCity,
        shippingProvince: orderValues.shippingProvince,
        shippingProvinceCode: orderValues.shippingProvinceCode,
        shippingCountry: orderValues.shippingCountry,
        shippingCountryCode: orderValues.shippingCountryCode,
        processedAt: orderValues.processedAt,
        cancelledAt: orderValues.cancelledAt,
        isSample: orderValues.isSample,
        updatedAt: orderValues.updatedAt,
      },
    })
    .returning({ id: order.id });

  const orderId = result.id;

  // Track UTM attribution if present — first sync of the order only
  if (isNewOrder && Object.keys(utm).length > 0) {
    await db.insert(utmAttribution).values({
      visitorId: customerId,
      source: utm.utm_source ?? null,
      medium: utm.utm_medium ?? null,
      campaign: utm.utm_campaign ?? null,
      term: utm.utm_term ?? null,
      content: utm.utm_content ?? null,
      landingPage: shopifyOrder.landing_site,
      referrer: shopifyOrder.referring_site,
    });

    // Set first-touch UTM on customer if not already set
    if (customerId && utm.utm_source) {
      await db
        .update(customer)
        .set({
          utmSource: sql`COALESCE(${customer.utmSource}, ${utm.utm_source})`,
          utmMedium: sql`COALESCE(${customer.utmMedium}, ${utm.utm_medium ?? null})`,
          utmCampaign: sql`COALESCE(${customer.utmCampaign}, ${utm.utm_campaign ?? null})`,
        })
        .where(eq(customer.id, customerId));
    }
  }

  // Replace line items: delete existing, then bulk insert
  await db.delete(orderLineItem).where(eq(orderLineItem.orderId, orderId));

  if (shopifyOrder.line_items.length > 0) {
    await db.insert(orderLineItem).values(
      shopifyOrder.line_items.map((item) => ({
        orderId,
        shopifyProductId: item.product_id ? String(item.product_id) : null,
        shopifyVariantId: item.variant_id ? String(item.variant_id) : null,
        title: item.title,
        variantTitle: item.variant_title,
        sku: item.sku,
        quantity: item.quantity,
        price: toCents(item.price),
      })),
    );
  }

  // Replace discount-code redemptions: delete existing, then bulk insert
  await db
    .delete(orderDiscountCode)
    .where(eq(orderDiscountCode.orderId, orderId));

  const discountCodes = shopifyOrder.discount_codes ?? [];
  if (discountCodes.length > 0) {
    await db.insert(orderDiscountCode).values(
      discountCodes.map((dc) => ({
        orderId,
        code: dc.code.trim().toLowerCase(),
        codeRaw: dc.code,
        amountCents: toCents(dc.amount),
        type: dc.type ?? null,
      })),
    );
  }

  // Replace per-product return detail: delete existing, then bulk insert.
  // Idempotent on re-sync, mirroring line items / discount codes above.
  await db.delete(orderRefundLine).where(eq(orderRefundLine.orderId, orderId));

  const refundRows = refundLineRows(shopifyOrder, orderId);
  if (refundRows.length > 0) {
    await db.insert(orderRefundLine).values(refundRows);
  }

  // Shipments (one per Shopify fulfillment / purchased label). Unlike the
  // delete-replace children above, shipments are UPSERT on the fulfillment id:
  // their label_cost_cents is imported separately from the billing CSV and must
  // survive every 2h resync, so the conflict-update set touches only the
  // Shopify-sourced tracking columns. See shipping-costs.md.
  await syncShipments(shopifyOrder, orderId);

  // Deterministic (pixel) / fallback link to a pre-purchase attribution touch
  // + PostHog person enrichment. Best-effort; never throws. Caller flushes.
  await linkOrderToAttribution(orderId, customerId, shopifyOrder);

  return orderId;
}

/**
 * Pure: map an order's Shopify fulfillments to `shipment` tracking columns.
 * Carrier comes from `tracking_company`; tracking number falls back from the
 * singular field to the first of the plural array. Exported for unit testing,
 * mirroring refundLineRows. `updatedAt` is stamped by the caller so this stays
 * deterministic.
 */
export function shipmentTrackingRows(
  shopifyOrder: ShopifyOrder,
): Array<{
  shopifyFulfillmentId: string;
  carrier: string | null;
  service: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string | null;
  shipmentStatus: string | null;
  shippedAt: Date | null;
}> {
  return (shopifyOrder.fulfillments ?? []).map((f) => ({
    shopifyFulfillmentId: String(f.id),
    carrier: f.tracking_company ?? null,
    service: f.service ?? null,
    trackingNumber: f.tracking_number ?? f.tracking_numbers?.[0] ?? null,
    trackingUrl: f.tracking_url ?? f.tracking_urls?.[0] ?? null,
    status: f.status ?? null,
    shipmentStatus: f.shipment_status ?? null,
    shippedAt: f.created_at ? new Date(f.created_at) : null,
  }));
}

/**
 * Upsert a row in `shipment` for each Shopify fulfillment / purchased label.
 * Dedup key is the fulfillment id. The conflict-update set is restricted to the
 * Shopify-sourced tracking columns so an imported `labelCostCents` (from the
 * billing CSV) is never clobbered by the every-2h order resync — the same
 * protection order.leadId gets. Additive: cancelled fulfillments are recorded,
 * never deleted.
 */
async function syncShipments(
  shopifyOrder: ShopifyOrder,
  orderId: string,
): Promise<void> {
  for (const row of shipmentTrackingRows(shopifyOrder)) {
    const { shopifyFulfillmentId, ...trackingColumns } = row;
    const setColumns = { ...trackingColumns, updatedAt: new Date() };
    await db
      .insert(shipment)
      .values({ orderId, shopifyFulfillmentId, ...setColumns })
      .onConflictDoUpdate({
        target: shipment.shopifyFulfillmentId,
        // Tracking columns only — cost columns are CSV-sourced and protected.
        set: setColumns,
      });
  }
}

// ── Incremental sync ────────────────────────────────────────────────

export async function syncRecentOrders(
  since: Date,
): Promise<{ synced: number; errors: number; firstError?: string }> {
  const shopify = getShopifyClient();
  let synced = 0;
  let errors = 0;
  let firstError: string | undefined;

  const endpoint = `/orders.json?limit=250&status=any&updated_at_min=${since.toISOString()}`;

  for await (const batch of shopify.fetchAll<ShopifyOrder>(
    endpoint,
    "orders",
  )) {
    for (const shopifyOrder of batch) {
      try {
        await upsertOrder(shopifyOrder);
        synced++;
      } catch (err) {
        errors++;
        firstError ??= err instanceof Error ? err.message : String(err);
        console.error(
          `Failed to upsert order ${shopifyOrder.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  console.log(
    `syncRecentOrders: ${synced} synced, ${errors} errors (since ${since.toISOString()})`,
  );
  return { synced, errors, firstError };
}

export async function syncRecentCustomers(
  since: Date,
): Promise<{ synced: number; errors: number; firstError?: string }> {
  const shopify = getShopifyClient();
  let synced = 0;
  let errors = 0;
  let firstError: string | undefined;

  const endpoint = `/customers.json?limit=250&updated_at_min=${since.toISOString()}`;

  for await (const batch of shopify.fetchAll<ShopifyCustomer>(
    endpoint,
    "customers",
  )) {
    for (const shopifyCustomer of batch) {
      try {
        await upsertCustomer(shopifyCustomer);
        synced++;
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        firstError ??= msg;
        console.error(`Failed to upsert customer ${shopifyCustomer.id}:`, msg);
      }
    }
  }

  console.log(
    `syncRecentCustomers: ${synced} synced, ${errors} errors (since ${since.toISOString()})`,
  );
  return { synced, errors, firstError };
}
