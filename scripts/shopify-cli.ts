import { config } from "dotenv";
config({ path: ".env.local" });

import { getShopifyClient } from "@/lib/shopify/client";
import { db } from "@/lib/db";
import { customer, order, orderLineItem } from "@/lib/schema";
import { desc, eq, count, sql, ilike, gte } from "drizzle-orm";
import { syncRecentOrders, syncRecentCustomers } from "@/lib/shopify/sync";

// ── Helpers ─────────────────────────────────────────────────────────

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string>;
}

function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "true";
      flags[key] = value;
      i += value === "true" ? 1 : 2;
    } else {
      positional.push(arg);
      i++;
    }
  }
  return { positional, flags };
}

function formatCurrency(cents: number): string {
  const dollars = (cents / 100).toFixed(2);
  return `$${dollars}`;
}

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const sep = widths.map((w) => "─".repeat(w + 2)).join("┼");

  const formatRow = (cells: string[]) =>
    cells.map((c, i) => ` ${(c ?? "").padEnd(widths[i])} `).join("│");

  console.log(formatRow(headers));
  console.log(sep);
  for (const row of rows) {
    console.log(formatRow(row));
  }
  console.log(`\n${rows.length} row(s)`);
}

function usage(): void {
  console.log(`
Fitwell Shopify CLI
Usage: npx tsx scripts/shopify-cli.ts <command> [args]

Commands:
  orders [--since YYYY-MM-DD] [--status STATUS] [--limit N]
      List recent orders from local DB (default: 20, sorted by date desc)

  customers [--email EMAIL] [--since YYYY-MM-DD] [--limit N]
      List customers from local DB (default: 20)

  products
      List products from Shopify API with SKUs and pricing

  order <shopify-id>
      Fetch full order detail from Shopify API

  customer <shopify-id>
      Fetch full customer detail from Shopify API

  sync-status
      Compare local DB counts vs Shopify API counts

  webhooks
      List registered webhooks from Shopify API

  register-webhooks [--address URL]
      Register all webhook topics (orders, cancellations, customers, refunds,
      fulfillments, products, collections, collection listings, draft orders)
      pointing at our handler. Idempotent — skips existing.
      Defaults to the production handler URL. Needs the write_webhooks scope.

  sync [--since YYYY-MM-DD]
      Trigger manual sync (default: last 24h)
`);
}

// ── Commands ────────────────────────────────────────────────────────

async function cmdOrders(flags: Record<string, string>): Promise<void> {
  const limit = parseInt(flags.limit ?? "20", 10);
  const conditions = [];

  if (flags.since) {
    conditions.push(gte(order.processedAt, new Date(flags.since)));
  }
  if (flags.status) {
    conditions.push(eq(order.financialStatus, flags.status));
  }

  const rows = await db
    .select({
      orderNumber: order.shopifyOrderNumber,
      processedAt: order.processedAt,
      firstName: customer.firstName,
      lastName: customer.lastName,
      totalPrice: order.totalPrice,
      financialStatus: order.financialStatus,
      fulfillmentStatus: order.fulfillmentStatus,
    })
    .from(order)
    .leftJoin(customer, eq(order.customerId, customer.id))
    .where(conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined)
    .orderBy(desc(order.processedAt))
    .limit(limit);

  const tableRows = rows.map((r) => [
    `#${r.orderNumber ?? "—"}`,
    formatDate(r.processedAt),
    [r.firstName, r.lastName].filter(Boolean).join(" ") || "—",
    formatCurrency(r.totalPrice ?? 0),
    r.financialStatus ?? "—",
    r.fulfillmentStatus ?? "unfulfilled",
  ]);

  printTable(
    ["Order#", "Date", "Customer", "Total", "Status", "Fulfillment"],
    tableRows,
  );
}

async function cmdCustomers(flags: Record<string, string>): Promise<void> {
  const limit = parseInt(flags.limit ?? "20", 10);
  const conditions = [];

  if (flags.email) {
    conditions.push(ilike(customer.email, `%${flags.email}%`));
  }
  if (flags.since) {
    conditions.push(gte(customer.createdAt, new Date(flags.since)));
  }

  const rows = await db
    .select({
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      orderCount: customer.orderCount,
      totalSpent: customer.totalSpent,
      firstOrderAt: customer.firstOrderAt,
      lastOrderAt: customer.lastOrderAt,
    })
    .from(customer)
    .where(conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined)
    .orderBy(desc(customer.lastOrderAt))
    .limit(limit);

  const tableRows = rows.map((r) => [
    [r.firstName, r.lastName].filter(Boolean).join(" ") || "—",
    r.email ?? "—",
    String(r.orderCount ?? 0),
    formatCurrency(r.totalSpent ?? 0),
    formatDate(r.firstOrderAt),
    formatDate(r.lastOrderAt),
  ]);

  printTable(
    ["Name", "Email", "Orders", "Total Spent", "First Order", "Last Order"],
    tableRows,
  );
}

async function cmdProducts(): Promise<void> {
  const shopify = getShopifyClient();
  const { products } = await shopify.getProducts({ limit: 250 });

  const tableRows = products.map((p) => {
    const skus = p.variants
      .map((v) => v.sku)
      .filter(Boolean)
      .join(", ");
    const prices = p.variants.map((v) => parseFloat(v.price));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange =
      minPrice === maxPrice
        ? `$${minPrice.toFixed(2)}`
        : `$${minPrice.toFixed(2)}–$${maxPrice.toFixed(2)}`;

    return [
      p.title,
      String(p.variants.length),
      skus || "—",
      priceRange,
      p.status,
    ];
  });

  printTable(["Title", "# Variants", "SKUs", "Price Range", "Status"], tableRows);
}

async function cmdOrder(shopifyId: string): Promise<void> {
  const shopify = getShopifyClient();
  const o = await shopify.getOrder(shopifyId);

  console.log(`\nOrder #${o.order_number} (Shopify ID: ${o.id})`);
  console.log("─".repeat(50));
  console.log(`Customer:     ${o.customer?.first_name ?? ""} ${o.customer?.last_name ?? ""} (${o.email})`);
  console.log(`Processed:    ${formatDate(o.processed_at)}`);
  console.log(`Status:       ${o.financial_status} / ${o.fulfillment_status ?? "unfulfilled"}`);
  console.log(`Subtotal:     ${formatCurrency(Math.round(parseFloat(o.subtotal_price) * 100))}`);
  console.log(`Tax:          ${formatCurrency(Math.round(parseFloat(o.total_tax) * 100))}`);
  console.log(`Discounts:    ${formatCurrency(Math.round(parseFloat(o.total_discounts) * 100))}`);
  console.log(`Total:        ${formatCurrency(Math.round(parseFloat(o.total_price) * 100))}`);
  console.log(`Currency:     ${o.currency}`);

  if (o.discount_codes.length > 0) {
    console.log(`Discount codes: ${o.discount_codes.map((d) => `${d.code} (${d.type}: ${d.amount})`).join(", ")}`);
  }
  if (o.note) {
    console.log(`Note:         ${o.note}`);
  }
  if (o.tags) {
    console.log(`Tags:         ${o.tags}`);
  }
  if (o.referring_site) {
    console.log(`Referring:    ${o.referring_site}`);
  }
  if (o.landing_site) {
    console.log(`Landing:      ${o.landing_site}`);
  }

  console.log(`\nLine Items:`);
  const lineRows = o.line_items.map((li) => [
    li.title + (li.variant_title ? ` (${li.variant_title})` : ""),
    li.sku ?? "—",
    String(li.quantity),
    formatCurrency(Math.round(parseFloat(li.price) * 100)),
  ]);
  printTable(["Item", "SKU", "Qty", "Price"], lineRows);

  if (o.refunds.length > 0) {
    console.log(`\nRefunds: ${o.refunds.length}`);
    for (const r of o.refunds) {
      console.log(`  - ${formatDate(r.created_at)} (ID: ${r.id})`);
    }
  }
}

async function cmdCustomer(shopifyId: string): Promise<void> {
  const shopify = getShopifyClient();
  const c = await shopify.getCustomer(shopifyId);

  console.log(`\nCustomer: ${c.first_name} ${c.last_name} (Shopify ID: ${c.id})`);
  console.log("─".repeat(50));
  console.log(`Email:        ${c.email}`);
  console.log(`Phone:        ${c.phone ?? "—"}`);
  console.log(`Orders:       ${c.orders_count}`);
  console.log(`Total Spent:  $${parseFloat(c.total_spent).toFixed(2)}`);
  console.log(`Tags:         ${c.tags || "—"}`);
  console.log(`Created:      ${formatDate(c.created_at)}`);
  console.log(`Updated:      ${formatDate(c.updated_at)}`);

  if (c.default_address) {
    const a = c.default_address;
    console.log(`\nDefault Address:`);
    console.log(`  ${a.address1}${a.address2 ? `, ${a.address2}` : ""}`);
    console.log(`  ${a.city}, ${a.province} ${a.zip}`);
    console.log(`  ${a.country}`);
  }
}

async function cmdSyncStatus(): Promise<void> {
  const shopify = getShopifyClient();

  // Local counts
  const [localOrders] = await db.select({ n: count() }).from(order);
  const [localCustomers] = await db.select({ n: count() }).from(customer);

  // Most recent local order date
  const [latestOrder] = await db
    .select({ processedAt: order.processedAt })
    .from(order)
    .orderBy(desc(order.processedAt))
    .limit(1);

  // Most recent local customer update
  const [latestCustomer] = await db
    .select({ updatedAt: customer.updatedAt })
    .from(customer)
    .orderBy(desc(customer.updatedAt))
    .limit(1);

  // Shopify counts
  const shopifyOrderCount = await shopify.getOrderCount({ status: "any" });
  const shopifyCustomerCount = await shopify.getCustomerCount();

  console.log("\nSync Status");
  console.log("─".repeat(50));
  console.log(`Local Orders:        ${localOrders.n}`);
  console.log(`Shopify Orders:      ${shopifyOrderCount}`);
  console.log(`Local Customers:     ${localCustomers.n}`);
  console.log(`Shopify Customers:   ${shopifyCustomerCount}`);
  console.log(`Most Recent Order:   ${formatDate(latestOrder?.processedAt ?? null)}`);
  console.log(`Most Recent Update:  ${formatDate(latestCustomer?.updatedAt ?? null)}`);

  const orderDrift = shopifyOrderCount - localOrders.n;
  const customerDrift = shopifyCustomerCount - localCustomers.n;
  if (orderDrift > 0 || customerDrift > 0) {
    console.log(
      `\n⚠ Drift detected: ${orderDrift} orders, ${customerDrift} customers behind Shopify`,
    );
  } else {
    console.log("\nLocal DB is in sync with Shopify.");
  }
}

async function cmdWebhooks(): Promise<void> {
  const shopify = getShopifyClient();
  const result = await shopify.fetch<{
    webhooks: Array<{ id: number; topic: string; address: string; created_at: string }>;
  }>("/webhooks.json");

  if (result.webhooks.length === 0) {
    console.log("\nNo webhooks registered.");
    return;
  }

  const tableRows = result.webhooks.map((w) => [
    w.topic,
    w.address,
    formatDate(w.created_at),
  ]);

  printTable(["Topic", "Address", "Created At"], tableRows);
}

// All webhook topics this app handles (see lib/shopify/webhooks.ts). The
// products/* and collections/* topics drive the item-chooser catalog-cache
// invalidation; the rest sync orders/customers/refunds.
const WEBHOOK_TOPICS = [
  "orders/create",
  "orders/updated",
  // Cancellations: the order payload carries cancelled_at. orders/updated
  // usually fires on cancel too, but the dedicated topic guarantees it.
  "orders/cancelled",
  // Portal pay-link payments: a paid draft-order invoice flips to "completed";
  // the handler reconciles it to the B2B invoice (auto-mark paid + notify).
  "draft_orders/update",
  "customers/create",
  "customers/update",
  "refunds/create",
  // Fulfillments: re-fetch the order so fulfillment_status + creator-sample
  // shipped/delivered stamps update in real time, not on the next 2h cron.
  "fulfillments/create",
  "fulfillments/update",
  "products/create",
  "products/update",
  "products/delete",
  "collections/create",
  "collections/update",
  "collections/delete",
  // Catalog-cache invalidation for collection membership changes. The handler
  // already covers these; they just weren't being registered.
  "collection_listings/add",
  "collection_listings/remove",
  "collection_listings/update",
];
const DEFAULT_WEBHOOK_ADDRESS =
  "https://portal.fitwellbuckle.co/api/webhooks/shopify";

async function cmdRegisterWebhooks(flags: Record<string, string>): Promise<void> {
  const address = flags.address ?? DEFAULT_WEBHOOK_ADDRESS;
  const shopify = getShopifyClient();

  // Skip topics already pointing at our address (idempotent).
  const existing = await shopify.fetch<{
    webhooks: Array<{ id: number; topic: string; address: string }>;
  }>("/webhooks.json");
  const have = new Set(
    existing.webhooks.filter((w) => w.address === address).map((w) => w.topic),
  );

  console.log(`Registering webhooks → ${address}\n`);
  let created = 0,
    skipped = 0,
    failed = 0;
  for (const topic of WEBHOOK_TOPICS) {
    if (have.has(topic)) {
      console.log(`  – ${topic}  (already registered)`);
      skipped++;
      continue;
    }
    try {
      await shopify.fetch("/webhooks.json", {
        method: "POST",
        body: JSON.stringify({ webhook: { topic, address, format: "json" } }),
      });
      console.log(`  ✓ ${topic}`);
      created++;
    } catch (e) {
      console.error(`  ✗ ${topic}: ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }
  console.log(`\nDone — created ${created}, skipped ${skipped}, failed ${failed}.`);
  if (failed > 0) {
    console.log(
      "If failures are 403 / scope errors, grant the app the write_webhooks " +
        "scope and re-authorize the store, then re-run.",
    );
  }
}

async function cmdSync(flags: Record<string, string>): Promise<void> {
  const since = flags.since
    ? new Date(flags.since)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  console.log(`\nSyncing since ${since.toISOString()}...`);

  console.log("\nSyncing orders...");
  const orderResult = await syncRecentOrders(since);
  console.log(`  Orders: ${orderResult.synced} synced, ${orderResult.errors} errors`);

  console.log("\nSyncing customers...");
  const customerResult = await syncRecentCustomers(since);
  console.log(
    `  Customers: ${customerResult.synced} synced, ${customerResult.errors} errors`,
  );

  console.log("\nSync complete.");
}

// ── Main ────────────────────────────────────────────────────────────

(async () => {
  // Stale: this script no longer needs SHOPIFY_ADMIN_API_TOKEN. All API calls
  // go through getShopifyClient() which uses OAuth Client Credentials (see
  // src/lib/shopify/client.ts → getToken()). Validate the three vars that
  // flow actually needs so failures are loud + early.
  const missing = ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"]
    .filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(
      `Error: missing required env var(s): ${missing.join(", ")}. Check .env.local`,
    );
    process.exit(1);
  }

  const rawArgs = process.argv.slice(2);
  const { positional, flags } = parseArgs(rawArgs);
  const command = positional[0];

  if (!command) {
    usage();
    process.exit(0);
  }

  switch (command) {
    case "orders":
      await cmdOrders(flags);
      break;
    case "customers":
      await cmdCustomers(flags);
      break;
    case "products":
      await cmdProducts();
      break;
    case "order": {
      const id = positional[1];
      if (!id) {
        console.error("Usage: shopify-cli order <shopify-id>");
        process.exit(1);
      }
      await cmdOrder(id);
      break;
    }
    case "customer": {
      const id = positional[1];
      if (!id) {
        console.error("Usage: shopify-cli customer <shopify-id>");
        process.exit(1);
      }
      await cmdCustomer(id);
      break;
    }
    case "sync-status":
      await cmdSyncStatus();
      break;
    case "webhooks":
      await cmdWebhooks();
      break;
    case "register-webhooks":
      await cmdRegisterWebhooks(flags);
      break;
    case "sync":
      await cmdSync(flags);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exit(1);
  }
})().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
