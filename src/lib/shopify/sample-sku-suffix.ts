/**
 * Plan the "- SAMPLE" SKU-collision fix. Each sample product is supposed to
 * carry a distinct SKU suffixed `-SAMPLE` (the M1 Stainless sample,
 * FWB001-SS-16-SAMPLE, is the correct precedent), but most sample products
 * reuse their real twin's base SKU verbatim. Since SKU is the canonical key
 * across COGS, incoming inventory, packaging labels, the Products list, and
 * CAD linking, those shared SKUs silently mis-attribute per-SKU data.
 *
 * This is the one-shot remediation planner: for every SKU the catalog detector
 * (`findSkuCollisions`) flags as a genuine collision, rename the SAMPLE-side
 * variant's SKU to `<base>-SAMPLE`. Pure — no API calls — so it's unit-tested
 * and the script can show a dry-run diff before any live-store write.
 *
 * Tying the plan to `findSkuCollisions` (rather than blindly suffixing every
 * sample variant) means we touch exactly the variants the Products page warns
 * about: fix them and the red "Duplicate SKUs" banner clears.
 */

import { findSkuCollisions, type CollisionVariant } from "@/lib/catalog/sku-collisions";
import type { ShopifyProduct } from "@/types/shopify";

const SAMPLE_SUFFIX = "-SAMPLE";

/** A product whose title ends in "- SAMPLE" (case-insensitive). */
export function isSampleProduct(title: string): boolean {
  return /\s*-\s*sample\s*$/i.test(title);
}

export interface SkuUpdate {
  productId: number;
  productTitle: string;
  variantId: number;
  variantTitle: string | null;
  oldSku: string;
  newSku: string;
}

export interface SkuSuffixPlan {
  updates: SkuUpdate[];
  /**
   * Collisions we could NOT auto-fix: the SKU collides but no SAMPLE-side
   * variant was found to rename (e.g. two non-sample products clash). These
   * need a human — the script surfaces them rather than guessing.
   */
  unresolved: { sku: string; products: string[] }[];
}

/**
 * Build the rename plan from the full product list.
 *
 * Detection is direct, NOT via `findSkuCollisions`: that detector deliberately
 * ignores a real product + its "- SAMPLE" twin sharing a SKU (it treats same-
 * base-title twins as legitimate), which is precisely the corruption we're
 * fixing here. So we instead rename any SAMPLE-product variant whose SKU is
 * reused by a non-sample product. A sample SKU that already ends in `-SAMPLE`
 * (the M1 Stainless precedent) or that is already unique is left alone, so this
 * is idempotent.
 *
 * `findSkuCollisions` is still used — for reporting `unresolved`: collisions the
 * Products-page banner flags that this run will NOT fix (e.g. two non-sample
 * products clashing). Those need a human, so the script surfaces them.
 */
export function planSampleSkuSuffix(products: readonly ShopifyProduct[]): SkuSuffixPlan {
  const live = products.filter((p) => p.status !== "archived");

  // SKUs in use by at least one NON-sample product — the "real" SKUs a sample
  // must not collide with.
  const realSkus = new Set<string>();
  for (const p of live) {
    if (isSampleProduct(p.title)) continue;
    for (const v of p.variants ?? []) {
      const sku = (v.sku ?? "").trim();
      if (sku) realSkus.add(sku);
    }
  }

  const updates: SkuUpdate[] = [];
  for (const p of live) {
    if (!isSampleProduct(p.title)) continue;
    for (const v of p.variants ?? []) {
      const sku = (v.sku ?? "").trim();
      if (!sku) continue;
      if (sku.toUpperCase().endsWith(SAMPLE_SUFFIX)) continue; // already distinct
      if (!realSkus.has(sku)) continue; // sample SKU already unique — leave it
      updates.push({
        productId: p.id,
        productTitle: p.title,
        variantId: v.id,
        variantTitle: v.title && v.title !== "Default Title" ? v.title : null,
        oldSku: sku,
        newSku: `${sku}${SAMPLE_SUFFIX}`,
      });
    }
  }
  updates.sort((a, b) => a.oldSku.localeCompare(b.oldSku));

  // Cross-check against the Products-page detector: anything it flags that this
  // plan does NOT rename is left for a human (and would keep the banner red).
  const rows: CollisionVariant[] = [];
  for (const p of live) {
    for (const v of p.variants ?? []) {
      const sku = (v.sku ?? "").trim();
      if (!sku) continue;
      rows.push({
        sku,
        title: p.title,
        variantTitle: v.title && v.title !== "Default Title" ? v.title : null,
        shopifyVariantId: String(v.id),
      });
    }
  }
  const renamed = new Set(updates.map((u) => u.oldSku));
  const unresolved = findSkuCollisions(rows)
    .filter((c) => !renamed.has(c.sku))
    .map((c) => ({ sku: c.sku, products: c.products.map((p) => p.label) }));

  return { updates, unresolved };
}

/** Group a flat update list by product, for per-product bulk mutations. */
export function groupUpdatesByProduct(
  updates: readonly SkuUpdate[],
): { productId: number; productTitle: string; variants: { id: number; sku: string }[] }[] {
  const byProduct = new Map<
    number,
    { productId: number; productTitle: string; variants: { id: number; sku: string }[] }
  >();
  for (const u of updates) {
    let g = byProduct.get(u.productId);
    if (!g) {
      g = { productId: u.productId, productTitle: u.productTitle, variants: [] };
      byProduct.set(u.productId, g);
    }
    g.variants.push({ id: u.variantId, sku: u.newSku });
  }
  return [...byProduct.values()];
}
