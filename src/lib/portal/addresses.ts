import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { company, customer, customerAddress, type InvoiceShipTo } from "@/lib/schema";

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
 * The company's saved Shopify addresses (across all its linked customers),
 * default first. Same source the admin B2B page uses; surfaced in the portal
 * so the buyer can pick a ship-to for their order.
 */
export async function getCompanyAddresses(companyId: string): Promise<CompanyAddress[]> {
  const ids = await linkedCustomerIds(companyId);
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
 * Resolve a chosen address id to a stable ship-to SNAPSHOT to store on the
 * invoice + drive the Shopify draft order. Returns null if the id isn't one of
 * the company's addresses (defense in depth — the portal only offers its own).
 */
export async function resolveShipTo(
  companyId: string,
  addressId: string,
): Promise<InvoiceShipTo | null> {
  const ids = await linkedCustomerIds(companyId);
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
 * Resolve an order's ship-to choices — the order-level address + each line's
 * (split-fulfillment) address — into validated snapshots, de-duplicating the
 * lookups. `orderShipTo` is `undefined` when no order-level address was sent
 * (leave unchanged), `null` when explicitly cleared.
 */
export async function resolveOrderShipTos(
  companyId: string,
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
  for (const id of uniqueIds) snaps.set(id, await resolveShipTo(companyId, id));

  const orderShipTo =
    orderAddressId === undefined
      ? undefined
      : orderAddressId
        ? snaps.get(orderAddressId) ?? null
        : null;
  const lineShipTos = lineAddressIds.map((id) => (id ? snaps.get(id) ?? null : null));
  return { orderShipTo, lineShipTos };
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
