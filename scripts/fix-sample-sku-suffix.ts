/**
 * One-shot: give each "- SAMPLE" product variant its own `-SAMPLE`-suffixed SKU
 * so it stops colliding with its real twin's base SKU. SKU is the canonical key
 * across COGS, incoming inventory, packaging labels, the Products list, and CAD
 * linking — shared SKUs silently mis-attribute per-SKU data, and the Products
 * page flags them in a red "Duplicate SKUs" banner.
 *
 * The plan is derived from the same detector the Products page uses
 * (`findSkuCollisions`), so applying it fixes exactly the flagged SKUs and
 * clears the banner. Idempotent: a sample SKU that already ends in `-SAMPLE`
 * (the M1 Stainless precedent) is left alone, so re-running is safe.
 *
 * Usage:
 *   npm run fix:sample-sku-suffix             # dry-run: show diff only
 *   npm run fix:sample-sku-suffix -- --apply  # actually push to Shopify
 *
 * Requires the write_products scope (same as the barcode sync). Until the app
 * is authorized for it, --apply throws "access denied".
 */

import { getShopifyClient } from "@/lib/shopify/client";
import {
  planSampleSkuSuffix,
  groupUpdatesByProduct,
} from "@/lib/shopify/sample-sku-suffix";
import type { ShopifyProduct } from "@/types/shopify";

async function loadAllProducts(): Promise<ShopifyProduct[]> {
  const client = getShopifyClient();
  const all: ShopifyProduct[] = [];
  let pageInfo: string | undefined;
  for (let page = 0; page < 50; page++) {
    const { products, nextPageUrl } = await client.getProducts({
      limit: 250,
      page_info: pageInfo,
    });
    all.push(...products);
    if (!nextPageUrl) break;
    pageInfo = nextPageUrl;
  }
  return all;
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}`);
  if (!apply) console.log("(pass --apply to actually push changes to Shopify)\n");

  const products = await loadAllProducts();
  console.log(`Fetched ${products.length} products from Shopify\n`);

  const { updates, unresolved } = planSampleSkuSuffix(products);

  console.log("── SKU renames ──");
  if (updates.length === 0) {
    console.log("  (none — every sample variant already has a distinct -SAMPLE SKU)");
  }
  for (const u of updates) {
    const label = u.variantTitle ? `${u.productTitle} — ${u.variantTitle}` : u.productTitle;
    console.log(`  ${u.oldSku.padEnd(22)} → ${u.newSku.padEnd(30)}  ${label}`);
  }

  if (unresolved.length > 0) {
    console.log("\n── Unresolved collisions (NOT auto-fixed — need a human) ──");
    for (const c of unresolved) {
      console.log(`  ${c.sku}: ${c.products.join("  |  ")}`);
    }
  }

  console.log("\n── Summary ──");
  console.log(`SKUs to rename:        ${updates.length}`);
  console.log(`Unresolved collisions: ${unresolved.length}`);

  if (!apply) {
    console.log("\nDry-run complete. Re-run with --apply to push to Shopify.");
    return;
  }
  if (updates.length === 0) {
    console.log("\nNothing to push.");
    return;
  }

  console.log("\n── Applying ──");
  const client = getShopifyClient();
  const groups = groupUpdatesByProduct(updates);
  let ok = 0;
  let failed = 0;
  for (const g of groups) {
    try {
      await client.bulkUpdateVariantSkus({
        productId: g.productId,
        variants: g.variants,
      });
      ok += g.variants.length;
      console.log(`  ✓ ${g.productTitle}  (${g.variants.length} SKU${g.variants.length === 1 ? "" : "s"})`);
    } catch (err) {
      failed += g.variants.length;
      console.error(`  ✗ ${g.productTitle}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nDone. ${ok} renamed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
