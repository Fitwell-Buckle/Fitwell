import { unstable_cache } from "next/cache";
import { getShopifyClient, toCents } from "@/lib/shopify/client";
import { skuSize } from "@/lib/production/display";
import { deriveAttrs } from "./attrs";

export interface CatalogVariant {
  shopifyProductId: string;
  shopifyVariantId: string;
  sku: string;
  title: string;
  variantTitle: string | null;
  /** Shopify retail price in cents (basis for B2B invoice pricing). */
  priceCents: number;
  /** Buckle size in mm + colour + material, from the variant's structured options. */
  sizeMm: number | null;
  color: string | null;
  material: string | null;
}

/** Flattened active Shopify catalog with derived size/colour. */
export async function loadCatalog(): Promise<CatalogVariant[]> {
  const client = getShopifyClient();
  const variants: CatalogVariant[] = [];

  let pageInfo: string | undefined;
  for (let page = 0; page < 50; page++) {
    const { products, nextPageUrl } = await client.getProducts({
      limit: 250,
      page_info: pageInfo,
    });
    for (const p of products) {
      // Include active AND draft ("unlisted" — not published to the storefront)
      // products so internal POs/invoices can reference them; only skip archived
      // (discontinued) items.
      if (p.status === "archived") continue;
      const optionNames = (p.options ?? []).map((o) => o.name);
      for (const v of p.variants ?? []) {
        const { sizeMm, color, material } = deriveAttrs(optionNames, [
          v.option1,
          v.option2,
          v.option3,
        ]);
        variants.push({
          shopifyProductId: String(p.id),
          shopifyVariantId: String(v.id),
          sku: v.sku ?? "",
          title: p.title,
          variantTitle: v.title && v.title !== "Default Title" ? v.title : null,
          priceCents: toCents(v.price),
          sizeMm,
          color,
          material,
        });
      }
    }
    if (!nextPageUrl) break;
    pageInfo = nextPageUrl;
  }
  return variants;
}

/**
 * Cached catalog for server components that only need variant attributes
 * (e.g. the POs page size/colour filter), so they don't re-page Shopify on
 * every render. The picker still fetches live via /api/production/products.
 */
export const getCatalogCached = unstable_cache(loadCatalog, ["production-catalog"], {
  revalidate: 3600,
});

export interface CatalogCollectionGroup {
  id: string;
  title: string;
  /** Shopify variant ids belonging to this collection. */
  variantIds: string[];
}

/**
 * Shopify collections with their member variant ids, for the standardized
 * Collection filter (server-rendered). Mirrors /api/production/collections but
 * returns just ids so it's cheap to cache. Products can belong to multiple
 * collections.
 */
export async function loadCatalogGroups(): Promise<CatalogCollectionGroup[]> {
  const client = getShopifyClient();

  // Variant ids per product (active products only).
  const variantIdsByProduct = new Map<string, string[]>();
  let pageInfo: string | undefined;
  for (let page = 0; page < 50; page++) {
    const { products, nextPageUrl } = await client.getProducts({
      limit: 250,
      page_info: pageInfo,
    });
    for (const p of products) {
      // Match loadCatalog: include active + draft (unlisted), skip only archived.
      if (p.status === "archived") continue;
      const ids = (p.variants ?? []).map((v) => String(v.id));
      if (ids.length) variantIdsByProduct.set(String(p.id), ids);
    }
    if (!nextPageUrl) break;
    pageInfo = nextPageUrl;
  }

  const collections = (await client.getCollections()).slice(0, 250);
  const groups: CatalogCollectionGroup[] = [];
  for (const c of collections) {
    const members = await client.getCollectionProducts(c.id);
    const variantIds: string[] = [];
    for (const m of members) {
      const vs = variantIdsByProduct.get(String(m.id));
      if (vs) variantIds.push(...vs);
    }
    if (variantIds.length) {
      groups.push({ id: String(c.id), title: c.title, variantIds });
    }
  }
  groups.sort((a, b) => a.title.localeCompare(b.title));
  return groups;
}

export const getCatalogGroupsCached = unstable_cache(
  loadCatalogGroups,
  ["production-catalog-groups"],
  { revalidate: 3600 },
);

/**
 * Build a `collectionOf(line)` resolver + the list of collection options from
 * the cached groups. A line "belongs to" a collection if its variant id is a
 * member. Shared by every page that renders the standardized filter.
 */
export function makeCollectionLookup(groups: CatalogCollectionGroup[]) {
  const byVariant = new Map<string, Set<string>>();
  for (const g of groups) {
    for (const vid of g.variantIds) {
      let set = byVariant.get(vid);
      if (!set) byVariant.set(vid, (set = new Set()));
      set.add(g.id);
    }
  }
  const inCollection = (li: LineAttrInput, collectionId: string): boolean =>
    !!li.shopifyVariantId && (byVariant.get(li.shopifyVariantId)?.has(collectionId) ?? false);
  const options = groups.map((g) => ({ id: g.id, title: g.title }));
  return { inCollection, options };
}

export interface CatalogFilterValues {
  collection?: string;
  size?: string;
  color?: string;
  material?: string;
}

/**
 * The set of catalog SKUs matching the active Collection/Size/Colour/Material
 * filter, or null when no filter is active. Lets list pages (orders, invoices)
 * filter rows by `line item sku IN (…)` while keeping SQL pagination.
 */
export function catalogSkusMatching(
  catalog: CatalogVariant[],
  groups: CatalogCollectionGroup[],
  { collection, size, color, material }: CatalogFilterValues,
): string[] | null {
  if (!collection && !size && !color && !material) return null;
  const { inCollection } = makeCollectionLookup(groups);
  const sizeN = size ? Number(size) : null;
  const skus = new Set<string>();
  for (const v of catalog) {
    if (collection && !inCollection({ sku: v.sku, shopifyVariantId: v.shopifyVariantId }, collection))
      continue;
    if (sizeN != null && v.sizeMm !== sizeN) continue;
    if (color && v.color !== color) continue;
    if (material && v.material !== material) continue;
    if (v.sku) skus.add(v.sku);
  }
  return [...skus];
}

/**
 * The set of variant ids a brand/influencer may order, given their assigned
 * Shopify collection ids + product ids. Returns null when nothing is assigned
 * (= unrestricted, the whole catalog). Used by the B2B portal + checkout to
 * enforce per-brand catalog restrictions server-side.
 */
export function allowedVariantIds(params: {
  assignedCollectionIds: string[] | null | undefined;
  assignedProductIds: string[] | null | undefined;
  groups: CatalogCollectionGroup[];
  catalog: CatalogVariant[];
}): Set<string> | null {
  const coll = new Set(params.assignedCollectionIds ?? []);
  const prod = new Set(params.assignedProductIds ?? []);
  if (coll.size === 0 && prod.size === 0) return null; // unrestricted
  const allowed = new Set<string>();
  for (const g of params.groups) {
    if (coll.has(g.id)) for (const vid of g.variantIds) allowed.add(vid);
  }
  for (const v of params.catalog) {
    if (prod.has(v.shopifyProductId)) allowed.add(v.shopifyVariantId);
  }
  return allowed;
}

export interface LineAttrInput {
  sku: string;
  shopifyVariantId: string | null;
}

/**
 * Resolve a stored production/invoice line's size + colour from the catalog (by
 * variant id), falling back to the SKU's trailing digits for size. Shared by
 * the Purchase Orders and Production Summary filters so they stay in sync.
 */
export function makeLineAttrs(catalog: CatalogVariant[]) {
  const byVariant = new Map(
    catalog.map((v) => [
      v.shopifyVariantId,
      { sizeMm: v.sizeMm, color: v.color, material: v.material },
    ]),
  );
  const sizeOf = (li: LineAttrInput): number | null => {
    const a = li.shopifyVariantId ? byVariant.get(li.shopifyVariantId) : null;
    if (a?.sizeMm != null) return a.sizeMm;
    const s = skuSize(li.sku);
    return s === 999999 ? null : s;
  };
  const colorOf = (li: LineAttrInput): string | null =>
    (li.shopifyVariantId ? byVariant.get(li.shopifyVariantId)?.color : null) ?? null;
  const materialOf = (li: LineAttrInput): string | null =>
    (li.shopifyVariantId ? byVariant.get(li.shopifyVariantId)?.material : null) ?? null;
  return { sizeOf, colorOf, materialOf };
}
