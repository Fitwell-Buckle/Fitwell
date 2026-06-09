/**
 * Keep each variant's Shopify `barcode` field equal to its SKU, so the Code 128
 * we print on packaging labels (which encodes the SKU) matches what Shopify
 * scans/reports on. Used by:
 *   - the one-shot backfill script (`npm run sync:sku-to-barcode`)
 *   - the `products/create` + `products/update` webhook (auto-sync on edits)
 *
 * The loop is bounded: pushing barcode=sku fires `products/update` again, but
 * the next pass sees barcode === sku and skips, so it terminates after one
 * extra no-op.
 *
 * Requires the write_products scope; without it the Shopify client throws and
 * the caller (the webhook route) swallows it as a logged warning.
 */

import { getShopifyClient } from "@/lib/shopify/client";
import type { ShopifyProduct, ShopifyVariant } from "@/types/shopify";

export type VariantUpdate = {
  variantId: number;
  sku: string;
  oldBarcode: string | null;
};

export type VariantSkip = {
  variantId: number;
  reason: "no-sku" | "already-matches";
  sku: string | null;
  barcode: string | null;
};

export type ProductPlan = {
  productId: number;
  productTitle: string;
  updates: VariantUpdate[];
  skipped: VariantSkip[];
};

/**
 * Decide what to push for one product. Pure — no API calls. Skips variants
 * whose SKU is empty (would otherwise blank an existing barcode) and variants
 * whose barcode already equals the SKU (no-op).
 */
export function planForProduct(p: ShopifyProduct): ProductPlan {
  const plan: ProductPlan = {
    productId: p.id,
    productTitle: p.title,
    updates: [],
    skipped: [],
  };
  for (const v of p.variants ?? []) {
    const sku = (v.sku ?? "").trim();
    const barcode = v.barcode ?? null;
    if (!sku) {
      plan.skipped.push({ variantId: v.id, reason: "no-sku", sku: null, barcode });
      continue;
    }
    if (barcode === sku) {
      plan.skipped.push({ variantId: v.id, reason: "already-matches", sku, barcode });
      continue;
    }
    plan.updates.push({ variantId: v.id, sku, oldBarcode: barcode });
  }
  return plan;
}

/**
 * Apply the plan for a single product. No-op when there's nothing to update.
 * Throws on Shopify userErrors (let the caller decide whether to surface or
 * swallow — the webhook route swallows; the script logs and continues).
 */
export async function applyPlan(plan: ProductPlan): Promise<void> {
  if (plan.updates.length === 0) return;
  const client = getShopifyClient();
  await client.bulkUpdateVariantBarcodes({
    productId: plan.productId,
    variants: plan.updates.map((u) => ({ id: u.variantId, barcode: u.sku })),
  });
}

/**
 * Convenience: plan + apply for a product payload (e.g. a webhook body).
 * Returns the plan so the caller can log what happened. Safe to call with a
 * product that has no variants needing changes — it's a no-op then.
 */
export async function syncProductBarcodes(
  p: ShopifyProduct,
): Promise<ProductPlan> {
  const plan = planForProduct(p);
  await applyPlan(plan);
  return plan;
}

// Re-export the type so callers that already import from this module don't
// also need to reach into @/types/shopify.
export type { ShopifyVariant };
