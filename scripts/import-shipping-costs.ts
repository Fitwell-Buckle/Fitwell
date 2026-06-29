/**
 * Import shipping label costs from a Shopify billing CSV export into
 * `shipping_charge`, matched to orders. Idempotent (delete-replace per Bill #).
 *
 * Export the CSV from Shopify Admin → Settings → Billing → Export bills.
 *
 * Dev (your branch):
 *   dotenv -e .env.local -- tsx scripts/import-shipping-costs.ts <path-to.csv>
 *
 * Production (after migration 0095 is applied to prod):
 *   dotenv -e .env.production.local -- tsx scripts/import-shipping-costs.ts <path-to.csv>
 *
 * Pass --dry to parse + match and print stats WITHOUT writing.
 */
import { readFileSync } from "node:fs";
import { parseBillingCsv, importShippingCharges } from "@/lib/shopify/billing-csv";
import { db } from "@/lib/db";
import { order } from "@/lib/schema";
import { inArray } from "drizzle-orm";

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const path = args.find((a) => !a.startsWith("--"));
  if (!path) {
    console.error("Usage: import-shipping-costs.ts <path-to.csv> [--dry]");
    process.exit(1);
  }

  const text = readFileSync(path, "utf8");
  const charges = parseBillingCsv(text);
  const bills = new Set(charges.map((c) => c.billNumber));
  console.log(
    `Parsed ${charges.length} shipping_fee charges across ${bills.size} bills from ${path}`,
  );

  if (dry) {
    // Match without writing.
    const numbers = [...new Set(charges.map((c) => c.orderNumber))];
    const rows = numbers.length
      ? await db
          .select({ num: order.shopifyOrderNumber })
          .from(order)
          .where(inArray(order.shopifyOrderNumber, numbers))
      : [];
    const have = new Set(rows.map((r) => r.num));
    let matched = 0,
      totalCents = 0,
      matchedCents = 0;
    const unmatched = new Set<string>();
    for (const c of charges) {
      totalCents += c.amountCents;
      if (have.has(c.orderNumber)) {
        matched++;
        matchedCents += c.amountCents;
      } else unmatched.add(c.orderName);
    }
    console.log(`\n[DRY RUN — no writes]`);
    console.log(`  matched charges:   ${matched}/${charges.length}`);
    console.log(`  matched orders:    ${have.size}/${numbers.length}`);
    console.log(`  total shipping:    ${fmt(totalCents)}`);
    console.log(`  matched shipping:  ${fmt(matchedCents)}`);
    console.log(`  unmatched orders:  ${unmatched.size} (sample: ${[...unmatched].slice(0, 15).join(", ")})`);
    process.exit(0);
  }

  const r = await importShippingCharges(charges);
  console.log(`\nImported into shipping_charge:`);
  console.log(`  bills:             ${r.bills}`);
  console.log(`  charges written:   ${r.totalCharges}`);
  console.log(`  matched to order:  ${r.matchedCharges} (${fmt(r.matchedCents)})`);
  console.log(`  unmatched:         ${r.unmatchedCharges}`);
  console.log(`  total shipping:    ${fmt(r.totalCents)}`);
  if (r.unmatchedOrderNames.length) {
    console.log(
      `  unmatched orders (${r.unmatchedOrderNames.length}): ${r.unmatchedOrderNames.slice(0, 20).join(", ")}${r.unmatchedOrderNames.length > 20 ? " …" : ""}`,
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("IMPORT FAILED:", e?.message ?? e);
  process.exit(1);
});
