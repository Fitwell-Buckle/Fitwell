import { db } from "@/lib/db";
import {
  customer,
  customerAddress,
  order,
  orderLineItem,
  utmAttribution,
} from "@/lib/schema";
import { getShopifyClient, toCents } from "./client";
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

  await db.transaction(async (tx) => {
    await tx
      .delete(customerAddress)
      .where(eq(customerAddress.customerId, customerId));
    await tx.insert(customerAddress).values(rows);
  });
}

// ── Order upsert ────────────────────────────────────────────────────

export async function upsertOrder(shopifyOrder: ShopifyOrder): Promise<string> {
  // Upsert the customer first if present
  let customerId: string | null = null;
  if (shopifyOrder.customer) {
    customerId = await upsertCustomer(shopifyOrder.customer);
  }

  const shopifyId = String(shopifyOrder.id);
  const utm = parseUtmParams(shopifyOrder.landing_site);
  const orderValues = {
    shopifyId,
    shopifyOrderNumber: shopifyOrder.order_number,
    customerId,
    totalPrice: toCents(shopifyOrder.total_price),
    subtotalPrice: toCents(shopifyOrder.subtotal_price),
    currency: shopifyOrder.currency,
    financialStatus: shopifyOrder.financial_status,
    fulfillmentStatus: shopifyOrder.fulfillment_status,
    sourceName: shopifyOrder.source_name,
    landingSite: shopifyOrder.landing_site,
    referringSite: shopifyOrder.referring_site,
    processedAt: shopifyOrder.processed_at
      ? new Date(shopifyOrder.processed_at)
      : new Date(shopifyOrder.created_at),
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
        currency: orderValues.currency,
        financialStatus: orderValues.financialStatus,
        fulfillmentStatus: orderValues.fulfillmentStatus,
        sourceName: orderValues.sourceName,
        landingSite: orderValues.landingSite,
        referringSite: orderValues.referringSite,
        processedAt: orderValues.processedAt,
        updatedAt: orderValues.updatedAt,
      },
    })
    .returning({ id: order.id });

  const orderId = result.id;

  // Track UTM attribution if present
  if (Object.keys(utm).length > 0) {
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

  // Deterministic (pixel) / fallback link to a pre-purchase attribution touch
  // + PostHog person enrichment. Best-effort; never throws. Caller flushes.
  await linkOrderToAttribution(orderId, customerId, shopifyOrder);

  return orderId;
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
