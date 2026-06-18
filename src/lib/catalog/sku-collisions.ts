// SKU is the canonical key across the catalog, the Products page, the
// /products/[sku] detail + barcode label, and sales/incoming aggregation — so a
// SKU assigned to more than one *distinct* product silently collapses them
// (whichever is seen first wins), surfacing the wrong product. This detects
// those genuine collisions so the Products page can warn about them. Pure +
// unit-tested. A real product and its "- SAMPLE" twin legitimately share a SKU,
// so those pairs are NOT flagged.

export interface CollisionVariant {
  sku: string;
  title: string;
  variantTitle: string | null;
  shopifyVariantId: string;
}

export interface SkuCollision {
  sku: string;
  products: { label: string; shopifyVariantId: string }[];
}

/** The base product name with a trailing "- SAMPLE" stripped, lowercased. */
function baseTitle(title: string): string {
  return title.replace(/\s*-\s*sample\b/i, "").trim().toLowerCase();
}

/**
 * SKUs assigned to two or more genuinely different products (ignoring real+SAMPLE
 * twins of the same product), sorted by SKU. Empty when the catalog is clean.
 */
export function findSkuCollisions(variants: readonly CollisionVariant[]): SkuCollision[] {
  const bySku = new Map<string, CollisionVariant[]>();
  for (const v of variants) {
    if (!v.sku) continue;
    const arr = bySku.get(v.sku);
    if (arr) arr.push(v);
    else bySku.set(v.sku, [v]);
  }

  const collisions: SkuCollision[] = [];
  for (const [sku, vs] of bySku) {
    if (vs.length < 2) continue;
    // Only a collision when the SKU spans 2+ DIFFERENT base products — a real
    // product + its "- SAMPLE" share a SKU on purpose and shouldn't be flagged.
    if (new Set(vs.map((v) => baseTitle(v.title))).size < 2) continue;
    collisions.push({
      sku,
      products: vs.map((v) => ({
        label: v.variantTitle ? `${v.title} — ${v.variantTitle}` : v.title,
        shopifyVariantId: v.shopifyVariantId,
      })),
    });
  }
  return collisions.sort((a, b) => a.sku.localeCompare(b.sku));
}
