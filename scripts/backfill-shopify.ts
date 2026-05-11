/**
 * Backfill all Shopify orders, customers, and products into the local database.
 *
 * Usage:
 *   npx tsx scripts/backfill-shopify.ts
 *
 * Safe to re-run — all writes are upserts so duplicates are handled gracefully.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { getShopifyClient } from "@/lib/shopify/client";
import { upsertOrder, upsertCustomer } from "@/lib/shopify/sync";
import type { ShopifyOrder, ShopifyCustomer, ShopifyProduct } from "@/types/shopify";

async function main() {
  const start = Date.now();
  const shopify = getShopifyClient();

  // ── Get totals for progress tracking ─────────────────────────────
  const [orderCount, customerCount] = await Promise.all([
    shopify.getOrderCount({ status: "any" }),
    shopify.getCustomerCount(),
  ]);

  console.log(`Found ${orderCount} orders, ${customerCount} customers to sync\n`);

  // ── Orders ───────────────────────────────────────────────────────
  let ordersSynced = 0;
  let orderErrors = 0;

  const ordersEndpoint = `/orders.json?limit=250&status=any`;

  for await (const batch of shopify.fetchAll<ShopifyOrder>(ordersEndpoint, "orders")) {
    for (const shopifyOrder of batch) {
      try {
        await upsertOrder(shopifyOrder);
        ordersSynced++;
      } catch (err) {
        orderErrors++;
        console.error(
          `Failed to upsert order ${shopifyOrder.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    console.log(`Orders: ${ordersSynced}/${orderCount} synced...`);
  }

  console.log(
    `\nOrders complete: ${ordersSynced} synced, ${orderErrors} errors\n`,
  );

  // ── Customers ────────────────────────────────────────────────────
  let customersSynced = 0;
  let customerErrors = 0;

  const customersEndpoint = `/customers.json?limit=250`;

  for await (const batch of shopify.fetchAll<ShopifyCustomer>(
    customersEndpoint,
    "customers",
  )) {
    for (const shopifyCustomer of batch) {
      try {
        await upsertCustomer(shopifyCustomer);
        customersSynced++;
      } catch (err) {
        customerErrors++;
        console.error(
          `Failed to upsert customer ${shopifyCustomer.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    console.log(`Customers: ${customersSynced}/${customerCount} synced...`);
  }

  console.log(
    `\nCustomers complete: ${customersSynced} synced, ${customerErrors} errors\n`,
  );

  // ── Products (log only — no products table yet) ──────────────────
  let productCount = 0;
  const skus: string[] = [];

  const productsEndpoint = `/products.json?limit=250`;

  for await (const batch of shopify.fetchAll<ShopifyProduct>(
    productsEndpoint,
    "products",
  )) {
    for (const product of batch) {
      productCount++;
      for (const variant of product.variants) {
        if (variant.sku) {
          skus.push(variant.sku);
        }
      }
    }
  }

  console.log(`Products: ${productCount} found`);
  if (skus.length > 0) {
    console.log(`SKUs: ${skus.join(", ")}`);
  }

  // ── Summary ──────────────────────────────────────────────────────
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Backfill complete in ${elapsed}s`);
  console.log(`  Orders:    ${ordersSynced} synced, ${orderErrors} errors`);
  console.log(`  Customers: ${customersSynced} synced, ${customerErrors} errors`);
  console.log(`  Products:  ${productCount} (logged only, no table yet)`);
  console.log(`${"─".repeat(50)}`);

  process.exit(orderErrors + customerErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
