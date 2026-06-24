import { db } from "@/lib/db";
import {
  order,
  orderLineItem,
  productionPoLineItem,
  productionPo,
  productCadModel,
} from "@/lib/schema";
import {
  sql,
  sum,
  count,
  and,
  eq,
  gte,
  isNull,
  isNotNull,
  lte,
  ne,
} from "drizzle-orm";
import { parseDateRange } from "@/lib/date-range";
import { getCatalogCached } from "@/lib/catalog/load";
import { findSkuCollisions } from "@/lib/catalog/sku-collisions";

// Shared data + ordering for the Products list. The list page renders it; the
// product detail page reuses it so its Prev/Next buttons walk the SAME ordered,
// filtered list the user clicked from. Keeping both on one function is what
// guarantees they never drift (the order depends on the date-bounded units sold,
// so it must be computed identically in both places).

export interface ProductListRow {
  key: string;
  sku: string;
  title: string;
  unitsSold: number;
  orderCount: number;
  revenue: number;
  /** This SKU's 3D model has been pushed to its Shopify product. */
  onShopify: boolean;
}

export interface ProductList {
  /** All catalog rows, sorted (units sold desc, then title). */
  rows: ProductListRow[];
  /** Rows after applying the `sku` filter — the list as displayed. */
  visible: ProductListRow[];
  incomingBySku: Map<string, number>;
  skuCollisions: ReturnType<typeof findSkuCollisions>;
  /** The parsed `sku` filter set (empty = no filter). */
  skuSet: Set<string>;
}

type SearchParams = Record<string, string | string[] | undefined>;

/** Parse the `sku` query param (comma-separated and/or repeated) into a set. */
export function parseSkuSet(rawSku: string | string[] | undefined): Set<string> {
  return new Set(
    (Array.isArray(rawSku) ? rawSku.join(",") : (rawSku ?? ""))
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * The filter context to carry from the list into a product link, so the detail
 * page can reconstruct the same list for Prev/Next. Only the keys that affect
 * the list (filter + date range), not detail-only params like `view`.
 */
export function buildListQuery(params: SearchParams): string {
  const qs = new URLSearchParams();
  for (const key of ["sku", "from", "to", "g"]) {
    const val = params[key];
    if (typeof val === "string" && val) qs.set(key, val);
    else if (Array.isArray(val) && val.length) qs.set(key, val.join(","));
  }
  return qs.toString();
}

export async function getProductList(params: SearchParams): Promise<ProductList> {
  const skuSet = parseSkuSet(params.sku);
  const { from, to } = parseDateRange(params);

  // Sales performance per SKU (from order line items), bounded by date range.
  const salesRows = await db
    .select({
      sku: orderLineItem.sku,
      title: orderLineItem.title,
      unitsSold: sum(orderLineItem.quantity).mapWith(Number),
      orderCount: count(sql`DISTINCT ${orderLineItem.orderId}`),
      revenue: sql<number>`coalesce(sum(${orderLineItem.price} * ${orderLineItem.quantity}), 0)::int`,
    })
    .from(orderLineItem)
    .innerJoin(order, eq(order.id, orderLineItem.orderId))
    .where(and(gte(order.processedAt, from), lte(order.processedAt, to)))
    .groupBy(orderLineItem.sku, orderLineItem.title)
    .orderBy(sql`sum(${orderLineItem.quantity}) desc`);
  const salesBySku = new Map(salesRows.map((r) => [r.sku ?? "", r]));

  // Incoming = produced-but-not-yet-received units, by SKU (excludes cancelled POs).
  const incomingRows = await db
    .select({
      sku: productionPoLineItem.sku,
      qty: sum(productionPoLineItem.quantity).mapWith(Number),
    })
    .from(productionPoLineItem)
    .innerJoin(productionPo, eq(productionPoLineItem.poId, productionPo.id))
    .where(
      and(
        isNull(productionPoLineItem.shopifyReceivedAt),
        ne(productionPo.status, "cancelled"),
      ),
    )
    .groupBy(productionPoLineItem.sku);
  const incomingBySku = new Map(incomingRows.map((r) => [r.sku, r.qty ?? 0]));

  // SKUs whose 3D model has been pushed to Shopify (drives the "On Shopify" tag).
  const publishedRows = await db
    .select({ sku: productCadModel.sku })
    .from(productCadModel)
    .where(isNotNull(productCadModel.shopifyPublishedAt));
  const onShopifySkus = new Set(publishedRows.map((r) => r.sku));

  // The list is the whole Shopify catalog (so brand-new / unsold products show
  // too), left-joined with the sales aggregates. Falls back to sales-only if
  // Shopify is unreachable. The catalog is cached — "Refresh catalog" re-pulls it.
  let catalog: Awaited<ReturnType<typeof getCatalogCached>> = [];
  try {
    catalog = await getCatalogCached();
  } catch (err) {
    console.error(
      "product list: catalog load failed — showing sold SKUs only",
      err,
    );
  }

  const rows: ProductListRow[] = [];
  const seen = new Set<string>();
  // SAMPLE variants share SKUs with their customer-facing twin, and sales are
  // keyed by SKU — so listing both rows would double-count the same revenue.
  // Visit non-samples first; the duplicate SAMPLE row is then skipped by `seen`.
  const sortedCatalog = [...catalog].sort((a, b) => {
    const aSample = /sample/i.test(`${a.title ?? ""} ${a.variantTitle ?? ""}`);
    const bSample = /sample/i.test(`${b.title ?? ""} ${b.variantTitle ?? ""}`);
    return Number(aSample) - Number(bSample);
  });
  for (const v of sortedCatalog) {
    const sku = v.sku ?? "";
    if (sku && seen.has(sku)) continue;
    const s = sku ? salesBySku.get(sku) : undefined;
    rows.push({
      key: sku || v.shopifyVariantId,
      sku,
      title: v.variantTitle ? `${v.title} — ${v.variantTitle}` : v.title,
      unitsSold: Number(s?.unitsSold ?? 0),
      orderCount: Number(s?.orderCount ?? 0),
      revenue: Number(s?.revenue ?? 0),
      onShopify: onShopifySkus.has(sku),
    });
    if (sku) seen.add(sku);
  }
  // Keep historical sold SKUs no longer in the catalog (e.g. archived items).
  for (const r of salesRows) {
    const sku = r.sku ?? "";
    if (sku && seen.has(sku)) continue;
    rows.push({
      key: sku || `sold-${rows.length}`,
      sku,
      title: r.title ?? "—",
      unitsSold: Number(r.unitsSold ?? 0),
      orderCount: Number(r.orderCount ?? 0),
      revenue: Number(r.revenue ?? 0),
      onShopify: onShopifySkus.has(sku),
    });
  }
  rows.sort(
    (a, b) => b.unitsSold - a.unitsSold || a.title.localeCompare(b.title),
  );

  const skuCollisions = findSkuCollisions(catalog);
  const visible = skuSet.size ? rows.filter((p) => skuSet.has(p.sku)) : rows;

  return { rows, visible, incomingBySku, skuCollisions, skuSet };
}
