/**
 * One-shot: copy each Shopify variant's SKU into its `barcode` field, so the
 * Code 128 barcode we print on packaging labels (which encodes the SKU) matches
 * what Shopify scans/reports on. Overwrites any existing barcode (including
 * legacy UPCs) — that's the intent.
 *
 * Usage:
 *   npm run sync:sku-to-barcode             # dry-run: show diff only
 *   npm run sync:sku-to-barcode -- --apply  # actually push to Shopify
 *
 * Variants are grouped per product and pushed via productVariantsBulkUpdate.
 * Skips variants with no SKU (would otherwise blank an existing barcode) and
 * variants where barcode already == sku (already in sync, no-op).
 *
 * Requires the write_products scope. Until shopify.app.toml is deployed and the
 * store re-authorizes the app, --apply will throw "access denied".
 */

import { getShopifyClient } from "@/lib/shopify/client";
import { planForProduct, applyPlan } from "@/lib/shopify/sku-barcode-sync";
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

function fmtBarcode(b: string | null): string {
  if (b === null) return "(empty)";
  if (b === "") return "(empty)";
  return b;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const mode = apply ? "APPLY" : "DRY-RUN";
  console.log(`Mode: ${mode}`);
  if (!apply) {
    console.log("(pass --apply to actually push changes to Shopify)\n");
  } else {
    console.log("(writing barcode = sku for every variant in scope)\n");
  }

  const products = await loadAllProducts();
  console.log(`Fetched ${products.length} products from Shopify\n`);

  // Build the plan up front so the totals are accurate even in apply mode.
  const plans = products
    .filter((p) => p.status !== "archived")
    .map(planForProduct);

  let totalUpdates = 0;
  let totalAlreadyMatches = 0;
  let totalNoSku = 0;
  let totalOverwritesExisting = 0;

  for (const plan of plans) {
    if (plan.updates.length === 0 && plan.skipped.length === 0) continue;
    totalUpdates += plan.updates.length;
    totalAlreadyMatches += plan.skipped.filter((s) => s.reason === "already-matches").length;
    totalNoSku += plan.skipped.filter((s) => s.reason === "no-sku").length;
    totalOverwritesExisting += plan.updates.filter((u) => u.oldBarcode && u.oldBarcode !== "").length;
  }

  console.log("── Per-product diff ──");
  for (const plan of plans) {
    if (plan.updates.length === 0 && plan.skipped.length === 0) continue;
    console.log(`\n${plan.productTitle}  (product ${plan.productId})`);
    for (const u of plan.updates) {
      console.log(
        `  ${u.variantId}  ${u.sku.padEnd(20)}  ${fmtBarcode(u.oldBarcode)} → ${u.sku}`,
      );
    }
    for (const s of plan.skipped) {
      const reason = s.reason === "no-sku" ? "skip (no SKU)" : "skip (already matches)";
      console.log(
        `  ${s.variantId}  ${(s.sku ?? "").padEnd(20)}  ${fmtBarcode(s.barcode)}  ${reason}`,
      );
    }
  }

  console.log("\n── Summary ──");
  console.log(`Variants to update:           ${totalUpdates}`);
  console.log(`  …of which overwrite existing: ${totalOverwritesExisting}`);
  console.log(`Variants already in sync:     ${totalAlreadyMatches}`);
  console.log(`Variants skipped (no SKU):    ${totalNoSku}`);

  if (!apply) {
    console.log("\nDry-run complete. Re-run with --apply to push to Shopify.");
    return;
  }

  if (totalUpdates === 0) {
    console.log("\nNothing to push — every in-scope variant already has barcode = sku.");
    return;
  }

  console.log("\n── Applying ──");
  let ok = 0;
  let failed = 0;
  for (const plan of plans) {
    if (plan.updates.length === 0) continue;
    try {
      await applyPlan(plan);
      ok += plan.updates.length;
      console.log(`  ✓ ${plan.productTitle}  (${plan.updates.length} variant${plan.updates.length === 1 ? "" : "s"})`);
    } catch (err) {
      failed += plan.updates.length;
      console.error(
        `  ✗ ${plan.productTitle}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log(`\nDone. ${ok} updated, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
