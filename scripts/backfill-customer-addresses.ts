/**
 * Backfill addresses for all existing Shopify-synced customers.
 *
 * The customer sync (`upsertCustomer` in src/lib/shopify/sync.ts) was updated
 * to also sync the customer's addresses delete-and-replace from the Shopify
 * payload. This script re-fetches every customer from Shopify and re-runs the
 * upsert so the new `customer_address` table is populated for the entire
 * existing customer base.
 *
 * Safe to re-run — addresses are sync'd delete-and-replace, so the result is
 * always whatever Shopify has right now.
 *
 * Usage:
 *   npx tsx scripts/backfill-customer-addresses.ts
 *
 * Rate: Shopify client has built-in rate-limit awareness + 429 backoff, so
 * this just runs sequentially. At ~100ms/customer it's roughly 25 min for
 * the ~15K Fitwell customers. Re-run is idempotent.
 */

import { isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { customer } from "@/lib/schema";
import { getShopifyClient } from "@/lib/shopify/client";
import { upsertCustomer } from "@/lib/shopify/sync";

async function main() {
  const start = Date.now();
  const shopify = getShopifyClient();

  const customers = await db
    .select({ id: customer.id, shopifyId: customer.shopifyId })
    .from(customer)
    .where(isNotNull(customer.shopifyId));

  console.log(
    `Backfilling addresses for ${customers.length} customers via Shopify…\n`,
  );

  let synced = 0;
  let errors = 0;
  for (const c of customers) {
    if (!c.shopifyId) continue;
    try {
      const shopifyCustomer = await shopify.getCustomer(c.shopifyId);
      await upsertCustomer(shopifyCustomer);
      synced++;
      if (synced % 50 === 0) {
        const elapsed = (Date.now() - start) / 1000;
        const rate = (synced / elapsed).toFixed(1);
        console.log(
          `  ${synced}/${customers.length} synced — ${rate}/s — ${elapsed.toFixed(0)}s elapsed`,
        );
      }
    } catch (err) {
      errors++;
      console.error(
        `  ✗ shopify_id=${c.shopifyId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const total = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `\nDone: ${synced} synced, ${errors} errors, ${total}s total.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
