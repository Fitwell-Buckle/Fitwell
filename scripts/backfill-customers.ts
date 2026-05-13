import { getShopifyClient } from "@/lib/shopify/client";
import { upsertCustomer } from "@/lib/shopify/sync";
import type { ShopifyCustomer } from "@/types/shopify";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const start = Date.now();
  const shopify = getShopifyClient();

  const totalCount = await shopify.getCustomerCount();
  console.log(`Starting customer backfill: ${totalCount} total customers`);

  let synced = 0;
  let errors = 0;
  const MAX_NETWORK_RETRIES = 5;

  // Wrap the paginated fetch with network-level retry
  let networkRetries = 0;

  while (true) {
    try {
      for await (const batch of shopify.fetchAll<ShopifyCustomer>("/customers.json?limit=250", "customers")) {
        for (const c of batch) {
          try {
            await upsertCustomer(c);
            synced++;
          } catch (err) {
            errors++;
            console.error(`Failed customer ${c.id}:`, err instanceof Error ? err.message : err);
          }
        }
        // Reset network retry counter on successful page fetch
        networkRetries = 0;
        console.log(`Customers: ${synced}/${totalCount} synced (${errors} errors)`);
      }
      // If we get here, pagination completed successfully
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isNetworkError =
        msg.includes("fetch failed") ||
        msg.includes("Connect Timeout") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("UND_ERR");

      if (isNetworkError && networkRetries < MAX_NETWORK_RETRIES) {
        networkRetries++;
        const backoff = Math.pow(2, networkRetries) * 2000; // 4s, 8s, 16s, 32s, 64s
        console.warn(`Network error (attempt ${networkRetries}/${MAX_NETWORK_RETRIES}): ${msg}`);
        console.warn(`Retrying full pagination in ${backoff / 1000}s (upserts are idempotent, already synced ${synced})...`);
        await sleep(backoff);
        // Continue the while loop — fetchAll restarts from page 1,
        // but upserts skip existing records efficiently
        continue;
      }
      throw err;
    }
  }

  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`\nCustomer backfill complete in ${elapsed}s`);
  console.log(`Synced: ${synced}, Errors: ${errors}`);
  process.exit(0);
}

main();
