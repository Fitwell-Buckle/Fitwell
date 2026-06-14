import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  company,
  customer,
  customerAddress,
  influencer,
  type InvoiceShipTo,
} from "@/lib/schema";
import { getShopifyClient } from "@/lib/shopify/client";
import { upsertCustomer } from "@/lib/shopify/sync";

// A company's saved Shopify address, for the portal ship-to picker.
export interface CompanyAddress {
  id: string;
  name: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
  country: string | null;
  zip: string | null;
  phone: string | null;
  isDefault: boolean;
}

/** Every Shopify customer linked to a company: its primary link + attached People. */
async function linkedCustomerIds(companyId: string): Promise<string[]> {
  const [comp, attached] = await Promise.all([
    db.query.company.findFirst({
      where: eq(company.id, companyId),
      columns: { customerId: true },
    }),
    db.select({ id: customer.id }).from(customer).where(eq(customer.companyId, companyId)),
  ]);
  return [
    ...new Set(
      [comp?.customerId, ...attached.map((a) => a.id)].filter(
        (x): x is string => Boolean(x),
      ),
    ),
  ];
}

/**
 * Self-heal core: re-fetch the given Shopify customers and upsert them
 * (delete-and-replaces their addresses) — so the ship-to / split-fulfillment
 * picker works even if the customer sync hasn't populated addresses yet. Same
 * effect as the admin "Sync from Shopify" button. Best-effort, never throws.
 * Keyed by customer id so both the company and influencer pickers reuse it.
 */
async function syncAddressesFromShopifyForCustomerIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const rows = await db
    .select({ shopifyId: customer.shopifyId })
    .from(customer)
    .where(and(isNotNull(customer.shopifyId), inArray(customer.id, ids)));
  const shopifyIds = new Set(rows.map((r) => r.shopifyId).filter((x): x is string => Boolean(x)));
  if (shopifyIds.size === 0) return;

  const client = getShopifyClient();
  for (const sid of shopifyIds) {
    try {
      await upsertCustomer(await client.getCustomer(sid));
    } catch (err) {
      console.error(`address self-heal failed for shopify customer ${sid}:`, err);
    }
  }
}

/**
 * Saved Shopify addresses across a set of customers, default first. The shared
 * core both the company picker and the influencer picker build on.
 */
async function readAddressesForCustomerIds(ids: string[]): Promise<CompanyAddress[]> {
  if (ids.length === 0) return [];
  const rows = await db.query.customerAddress.findMany({
    where: inArray(customerAddress.customerId, ids),
    orderBy: [desc(customerAddress.isDefault), asc(customerAddress.city)],
  });
  return rows.map((a) => ({
    id: a.id,
    name: [a.firstName, a.lastName].filter(Boolean).join(" ") || null,
    company: a.company,
    address1: a.address1,
    address2: a.address2,
    city: a.city,
    province: a.province,
    provinceCode: a.provinceCode,
    country: a.country,
    zip: a.zip,
    phone: a.phone,
    isDefault: a.isDefault ?? false,
  }));
}

/**
 * Read addresses for a set of customers, self-healing from Shopify once if the
 * local cache is empty (so the picker isn't silently empty pre-sync).
 */
async function getAddressesForCustomerIds(ids: string[]): Promise<CompanyAddress[]> {
  let rows = await readAddressesForCustomerIds(ids);
  if (rows.length === 0 && ids.length > 0) {
    try {
      await syncAddressesFromShopifyForCustomerIds(ids);
      rows = await readAddressesForCustomerIds(ids);
    } catch (err) {
      console.error("address self-heal failed:", err);
    }
  }
  return rows;
}

/**
 * The company's saved Shopify addresses (across all its linked customers),
 * default first. Same source the admin B2B page uses; surfaced in the portal
 * so the buyer can pick a ship-to for their order.
 */
export async function getCompanyAddresses(companyId: string): Promise<CompanyAddress[]> {
  return getAddressesForCustomerIds(await linkedCustomerIds(companyId));
}

/**
 * Resolve a chosen address id to a stable ship-to SNAPSHOT against a set of
 * customers. Returns null if the id isn't one of theirs (defense in depth — a
 * caller only offers its own addresses). The shared core under both the company
 * and influencer resolvers.
 */
async function resolveShipToForCustomerIds(
  ids: string[],
  addressId: string,
): Promise<InvoiceShipTo | null> {
  if (ids.length === 0) return null;
  const a = await db.query.customerAddress.findFirst({
    where: eq(customerAddress.id, addressId),
  });
  if (!a || !ids.includes(a.customerId)) return null;
  return {
    addressId: a.id,
    firstName: a.firstName,
    lastName: a.lastName,
    company: a.company,
    address1: a.address1,
    address2: a.address2,
    city: a.city,
    province: a.province,
    provinceCode: a.provinceCode,
    country: a.country,
    zip: a.zip,
    phone: a.phone,
  };
}

/**
 * Resolve an order's ship-to choices (order-level + per-line split addresses)
 * into validated snapshots against a set of customers, de-duplicating lookups.
 * `orderShipTo` is `undefined` when no order-level address was sent (leave
 * unchanged), `null` when explicitly cleared. Shared core for both order types.
 */
async function resolveOrderShipTosForCustomerIds(
  ids: string[],
  orderAddressId: string | undefined,
  lineAddressIds: (string | undefined)[],
): Promise<{
  orderShipTo: InvoiceShipTo | null | undefined;
  lineShipTos: (InvoiceShipTo | null)[];
}> {
  const uniqueIds = [
    ...new Set(
      [orderAddressId, ...lineAddressIds].filter((x): x is string => Boolean(x)),
    ),
  ];
  const snaps = new Map<string, InvoiceShipTo | null>();
  for (const id of uniqueIds) snaps.set(id, await resolveShipToForCustomerIds(ids, id));

  const orderShipTo =
    orderAddressId === undefined
      ? undefined
      : orderAddressId
        ? snaps.get(orderAddressId) ?? null
        : null;
  const lineShipTos = lineAddressIds.map((id) => (id ? snaps.get(id) ?? null : null));
  return { orderShipTo, lineShipTos };
}

/**
 * Resolve a chosen address id to a stable ship-to SNAPSHOT to store on the
 * invoice + drive the Shopify draft order. Returns null if the id isn't one of
 * the company's addresses (defense in depth — the portal only offers its own).
 */
export async function resolveShipTo(
  companyId: string,
  addressId: string,
): Promise<InvoiceShipTo | null> {
  return resolveShipToForCustomerIds(await linkedCustomerIds(companyId), addressId);
}

/**
 * Resolve an order's ship-to choices — the order-level address + each line's
 * (split-fulfillment) address — into validated snapshots, de-duplicating the
 * lookups. `orderShipTo` is `undefined` when no order-level address was sent
 * (leave unchanged), `null` when explicitly cleared.
 */
export async function resolveOrderShipTos(
  companyId: string,
  orderAddressId: string | undefined,
  lineAddressIds: (string | undefined)[],
): ReturnType<typeof resolveOrderShipTosForCustomerIds> {
  return resolveOrderShipTosForCustomerIds(
    await linkedCustomerIds(companyId),
    orderAddressId,
    lineAddressIds,
  );
}

// ─── Influencer gifting orders ──────────────────────────────────────
// Influencers have no company; they optionally link to a single synced Shopify
// customer (`influencer.customer_id`). The gifting order's ship-to picker reuses
// the exact same address machinery, keyed by that customer. Empty when the
// influencer isn't customer-linked (the grid shows its "add a location" hint).

/** The linked Shopify customer for an influencer, as a (0- or 1-element) id list. */
async function influencerCustomerIds(influencerId: string): Promise<string[]> {
  const inf = await db.query.influencer.findFirst({
    where: eq(influencer.id, influencerId),
    columns: { customerId: true },
  });
  return inf?.customerId ? [inf.customerId] : [];
}

/** Saved addresses available to gift to, sourced from the linked Shopify customer. */
export async function getInfluencerAddresses(
  influencerId: string,
): Promise<CompanyAddress[]> {
  return getAddressesForCustomerIds(await influencerCustomerIds(influencerId));
}

/** Influencer-order equivalent of `resolveOrderShipTos`. */
export async function resolveInfluencerOrderShipTos(
  influencerId: string,
  orderAddressId: string | undefined,
  lineAddressIds: (string | undefined)[],
): ReturnType<typeof resolveOrderShipTosForCustomerIds> {
  return resolveOrderShipTosForCustomerIds(
    await influencerCustomerIds(influencerId),
    orderAddressId,
    lineAddressIds,
  );
}

/** A stored ship-to snapshot as the Shopify draft order's shipping address. */
export function shipToToShopify(s: InvoiceShipTo) {
  return {
    firstName: s.firstName,
    lastName: s.lastName,
    company: s.company,
    address1: s.address1,
    address2: s.address2,
    city: s.city,
    province: s.province,
    country: s.country,
    zip: s.zip,
    phone: s.phone,
  };
}

/** One-line label for a stored ship-to (orders list / detail). */
export function shipToLabel(s: InvoiceShipTo): string {
  const name = [s.firstName, s.lastName].filter(Boolean).join(" ");
  return [name || s.company, s.address1, s.city, s.provinceCode ?? s.province, s.zip]
    .filter(Boolean)
    .join(", ");
}

export interface ShipPlanLine {
  sku: string;
  title: string;
  quantity: number;
  shipTo: InvoiceShipTo | null;
}

/**
 * Build the Shopify draft-order product lines (with per-line "Ship to" custom
 * attributes when the order is split) plus a grouped split note for the order.
 * Shopify can't hold >1 destination per order, so split fulfillment is recorded
 * as line attributes + the note; the order-level address stays the primary.
 * Shared by the portal submit, the admin invoice send, and the tier-reprice
 * regeneration so all three sync the split identically.
 */
export function buildSplitShipping(
  lineItems: {
    sku: string;
    title: string;
    quantity: number;
    shopifyVariantId: string | null;
    unitPriceCents: number;
    shipTo: InvoiceShipTo | null;
  }[],
  primary: InvoiceShipTo | null,
): {
  productLines: {
    variantId: string | null;
    title: string;
    quantity: number;
    unitPriceCents: number;
    customAttributes?: { key: string; value: string }[];
  }[];
  splitNote: string;
} {
  const primaryLabel = primary ? shipToLabel(primary) : null;
  const lineLabel = (s: InvoiceShipTo | null): string | null => (s ? shipToLabel(s) : primaryLabel);
  const split = isSplitOrder(lineItems);

  const productLines = lineItems.map((l) => {
    const dest = split ? lineLabel(l.shipTo) : null;
    return {
      variantId: l.shopifyVariantId,
      title: l.title,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      ...(dest ? { customAttributes: [{ key: "Ship to", value: dest }] } : {}),
    };
  });

  let splitNote = "";
  if (split) {
    const byDest = new Map<string, string[]>();
    for (const l of lineItems) {
      const dest = lineLabel(l.shipTo) ?? "(no address on file)";
      const entry = `${l.quantity}× ${l.sku || l.title}`;
      const arr = byDest.get(dest);
      if (arr) arr.push(entry);
      else byDest.set(dest, [entry]);
    }
    splitNote =
      "\n\nSplit fulfillment — ship to multiple addresses:\n" +
      [...byDest.entries()].map(([dest, items]) => `• ${dest}: ${items.join(", ")}`).join("\n");
  }
  return { productLines, splitNote };
}

export interface ShipPlanGroup {
  label: string;
  isDefault: boolean;
  lines: { sku: string; title: string; quantity: number }[];
}

/** Does this order ship to more than the default address (split fulfillment)? */
export function isSplitOrder(lineItems: { shipTo: InvoiceShipTo | null }[]): boolean {
  return lineItems.some((l) => l.shipTo != null);
}

/**
 * Group an order's line items by destination address — the "ship plan" the
 * admin packs against. Lines without a per-line ship-to fall under the order's
 * primary (default) address.
 */
export function buildShipPlan(
  lineItems: ShipPlanLine[],
  primary: InvoiceShipTo | null,
): ShipPlanGroup[] {
  const primaryLabel = primary ? shipToLabel(primary) : "Default address";
  const groups = new Map<string, ShipPlanGroup>();
  for (const l of lineItems) {
    const isDefault = l.shipTo == null;
    const label = isDefault ? primaryLabel : shipToLabel(l.shipTo as InvoiceShipTo);
    const key = isDefault ? "__default__" : label;
    let g = groups.get(key);
    if (!g) {
      g = { label, isDefault, lines: [] };
      groups.set(key, g);
    }
    g.lines.push({ sku: l.sku, title: l.title, quantity: l.quantity });
  }
  return [...groups.values()];
}
