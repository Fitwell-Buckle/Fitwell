/**
 * In-box card analysis — evaluates the 360 Workstream 1 §4 card before any
 * print commitment. The card as scoped: "$29 for your next buckle. 30-day
 * expiry. Unique discount code." Target redemption: 25%+.
 *
 * Question: does the card lift repeat rate enough to clear the margin
 * transfer to customers who'd have come back anyway? Same shape of
 * concern that killed the public bundle ladder.
 *
 * Cuts against the prod `order` + `order_line_item` tables:
 *
 *   1. Time-to-second-order distribution. Of customers who repeat, how
 *      many days between 1st and 2nd order? Buckets: 0-7d, 8-14d, 15-30d,
 *      31-60d, 61-90d, 91+d. The card's 30-day expiry only catches the
 *      0-30d cohort.
 *
 *   2. Baseline 30-day repeat rate. Of all first-time customers with
 *      enough window for a 30-day repeat to land, what % came back inside
 *      30 days? This is R0 — the baseline the card must lift.
 *
 *   3. What did 2nd-order buyers actually pay (inside the 30-day window)?
 *      Discount % distribution. If they're already using 15% codes on 2nd
 *      orders, the card is duplicative; if they pay full, the card has
 *      room.
 *
 *   4. Quantity of 2nd orders inside 30 days. Card says "next buckle"
 *      singular. If 2nd orders are typically 2+, the framing collides
 *      with the D30 outfit-code logic.
 *
 *   5. Break-even sensitivity. At assumed contribution margin per buckle
 *      and assumed card mechanics, how much must the card lift the
 *      baseline 30-day repeat rate to net positive? Sensitivity to
 *      redemption rate, print cost, incremental fraction.
 *
 * D2C only (NULL or non-draft source_name). Cancelled orders excluded.
 * Window: 2025-11-01 → today.
 *
 * Run:
 *   npx vercel --global-config ~/.vercel-fitwell env pull \
 *     .env.production.local --environment=production --yes
 *   npx dotenv -e .env.production.local -- node --import tsx/esm \
 *     scripts/in-box-card-analysis.ts
 *   rm -f .env.production.local
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const WINDOW_START = "2025-11-01";

// Card mechanic assumptions (tunable; flagged for Tom in spec doc)
const CARD_DISCOUNT_USD = 11; // $40 retail → $29 net
const FULL_PRICE_USD = 40;
// COGS confirmed by Tom 2026-06-06 (specs/ops/domains/costs.md):
// M1 SS / M4: $3.65 (dominant). M1 Titanium: $4.50. Using $3.65 as the
// modal cost; titanium would shift contribution by ~$0.85/unit (worse).
const COGS_PER_UNIT_USD = 3.65;
const PRINT_COST_PER_CARD_USD = 0.5; // Moo.com rough rate; surfaced as a knob

const fmt$ = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtPct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;

const pad = (s: string | number, w: number, right = false) =>
  right ? String(s).padStart(w) : String(s).padEnd(w);

type OrderRow = {
  id: string;
  customer_id: string | null;
  processed_at: Date;
  subtotal_price_cents: number;
  total_discounts_cents: number;
  total_units: number;
  order_position: number;
  days_since_first: number | null; // null for first orders
};

async function loadOrders(): Promise<OrderRow[]> {
  const result = await db.execute(sql`
    WITH base AS (
      SELECT
        o.id,
        o.customer_id,
        o.processed_at,
        COALESCE(o.subtotal_price, 0)::int    AS subtotal_price_cents,
        COALESCE(o.total_discounts, 0)::int   AS total_discounts_cents,
        COALESCE(li_agg.total_units, 0)::int  AS total_units,
        ROW_NUMBER() OVER (
          PARTITION BY o.customer_id
          ORDER BY o.processed_at
        )::int AS order_position,
        MIN(o.processed_at) OVER (PARTITION BY o.customer_id) AS first_order_at
      FROM "order" o
      LEFT JOIN (
        SELECT order_id, SUM(quantity)::int AS total_units
        FROM order_line_item
        GROUP BY order_id
      ) li_agg ON li_agg.order_id = o.id
      WHERE o.cancelled_at IS NULL
        AND (o.source_name IS NULL OR o.source_name != 'shopify_draft_order')
        AND o.processed_at IS NOT NULL
        AND o.processed_at >= ${WINDOW_START}::date
        AND o.customer_id IS NOT NULL
    )
    SELECT
      id,
      customer_id,
      processed_at,
      subtotal_price_cents,
      total_discounts_cents,
      total_units,
      order_position,
      CASE
        WHEN order_position = 1 THEN NULL
        ELSE EXTRACT(EPOCH FROM (processed_at - first_order_at)) / 86400.0
      END::float AS days_since_first
    FROM base
  `);
  const rows: OrderRow[] =
    (result as unknown as { rows?: OrderRow[] }).rows ??
    (result as unknown as OrderRow[]);
  return rows;
}

function bucketDays(days: number): string {
  if (days <= 7) return "0-7d";
  if (days <= 14) return "8-14d";
  if (days <= 30) return "15-30d";
  if (days <= 60) return "31-60d";
  if (days <= 90) return "61-90d";
  return "91+d";
}

const DAY_BUCKETS = ["0-7d", "8-14d", "15-30d", "31-60d", "61-90d", "91+d"];

async function main() {
  console.log("─".repeat(78));
  console.log("IN-BOX CARD ANALYSIS");
  console.log(`Window: ${WINDOW_START} → today (D2C only, customer_id NOT NULL)`);
  console.log("Cancelled orders excluded");
  console.log("─".repeat(78));

  const orders = await loadOrders();
  console.log(`\nTotal customer-tagged D2C orders: ${orders.length}`);

  // Group orders by customer to compute repeat behavior
  const byCustomer = new Map<string, OrderRow[]>();
  for (const o of orders) {
    if (!o.customer_id) continue;
    if (!byCustomer.has(o.customer_id)) byCustomer.set(o.customer_id, []);
    byCustomer.get(o.customer_id)!.push(o);
  }
  for (const list of byCustomer.values()) {
    list.sort((a, b) => +a.processed_at - +b.processed_at);
  }

  const totalCustomers = byCustomer.size;
  const firstOrders = orders.filter((o) => o.order_position === 1);
  const secondOrders = orders.filter((o) => o.order_position === 2);

  console.log(`Distinct customers: ${totalCustomers}`);
  console.log(`First orders: ${firstOrders.length}`);
  console.log(`Second-or-later orders: ${orders.length - firstOrders.length}`);

  // ─── Cut 1: Time-to-second-order distribution ──────────────────────
  console.log("\n## Cut 1 — Time-to-second-order distribution (repeaters only)");
  console.log("─".repeat(78));

  const dayBucketCounts = new Map<string, number>();
  for (const b of DAY_BUCKETS) dayBucketCounts.set(b, 0);
  for (const o of secondOrders) {
    if (o.days_since_first == null) continue;
    const b = bucketDays(o.days_since_first);
    dayBucketCounts.set(b, (dayBucketCounts.get(b) ?? 0) + 1);
  }

  console.log(
    [pad("days since 1st", 16), pad("repeaters", 12, true), pad("share", 10, true), pad("cum share", 12, true)].join("  "),
  );
  console.log("-".repeat(54));
  let cum = 0;
  const totalRepeaters = secondOrders.length;
  for (const b of DAY_BUCKETS) {
    const n = dayBucketCounts.get(b) ?? 0;
    const share = totalRepeaters > 0 ? (n / totalRepeaters) * 100 : 0;
    cum += share;
    console.log(
      [
        pad(b, 16),
        pad(n, 12, true),
        pad(fmtPct(share), 10, true),
        pad(fmtPct(cum), 12, true),
      ].join("  "),
    );
  }

  const inWindowRepeaters =
    (dayBucketCounts.get("0-7d") ?? 0) +
    (dayBucketCounts.get("8-14d") ?? 0) +
    (dayBucketCounts.get("15-30d") ?? 0);
  const inWindowShare = totalRepeaters > 0 ? (inWindowRepeaters / totalRepeaters) * 100 : 0;
  console.log(`\n→ ${inWindowRepeaters} of ${totalRepeaters} repeats (${fmtPct(inWindowShare)}) happen INSIDE the 30-day card window`);

  // ─── Cut 2: Baseline 30-day repeat rate (R0) ────────────────────────
  console.log("\n## Cut 2 — Baseline 30-day repeat rate (R0)");
  console.log("─".repeat(78));

  const today = new Date();
  const cutoff30Ms = today.getTime() - 30 * 86400 * 1000;
  const tsOf = (d: Date | string): number =>
    typeof d === "string" ? new Date(d).getTime() : d.getTime();

  // Only count first orders that had at least 30 days of observation window
  const eligibleFirstOrders = firstOrders.filter((o) => tsOf(o.processed_at) < cutoff30Ms);
  const eligibleCustomerIds = new Set(eligibleFirstOrders.map((o) => o.customer_id!));

  // Count second orders that landed within 30 days of first AND belong to
  // a customer whose first order had 30 days of window
  let repeatersIn30d = 0;
  for (const o of secondOrders) {
    if (o.days_since_first == null) continue;
    if (o.days_since_first > 30) continue;
    if (eligibleCustomerIds.has(o.customer_id!)) repeatersIn30d++;
  }

  const R0 = eligibleFirstOrders.length > 0 ? repeatersIn30d / eligibleFirstOrders.length : 0;

  console.log(`Eligible first-orders (≥30d of observation): ${eligibleFirstOrders.length}`);
  console.log(`Of those, repeated within 30 days: ${repeatersIn30d}`);
  console.log(`→ R0 (baseline 30-day repeat rate): ${fmtPct(R0 * 100)}`);

  // ─── Cut 3: Discount usage on 2nd orders inside 30 days ────────────
  console.log("\n## Cut 3 — Discount usage on 2nd orders inside 30 days");
  console.log("─".repeat(78));

  const secondInWindow = secondOrders.filter((o) => o.days_since_first != null && o.days_since_first <= 30);

  const discountBands = [
    { label: "0% (no discount)", min: 0, max: 0.001 },
    { label: "0 < x < 10%", min: 0.001, max: 0.10 },
    { label: "10-15%", min: 0.10, max: 0.15 },
    { label: "15-20%", min: 0.15, max: 0.20 },
    { label: "20-30%", min: 0.20, max: 0.30 },
    { label: "> 30%", min: 0.30, max: 1.01 },
  ];
  const bandCounts = new Map<string, number>();
  for (const b of discountBands) bandCounts.set(b.label, 0);

  for (const o of secondInWindow) {
    if (o.subtotal_price_cents === 0) continue;
    const rate = o.total_discounts_cents / o.subtotal_price_cents;
    for (const b of discountBands) {
      if (rate >= b.min && rate < b.max) {
        bandCounts.set(b.label, (bandCounts.get(b.label) ?? 0) + 1);
        break;
      }
    }
  }

  console.log(`Second orders inside 30 days: ${secondInWindow.length}\n`);
  console.log([pad("discount band", 20), pad("orders", 8, true), pad("share", 10, true)].join("  "));
  console.log("-".repeat(40));
  for (const b of discountBands) {
    const n = bandCounts.get(b.label) ?? 0;
    const share = secondInWindow.length > 0 ? (n / secondInWindow.length) * 100 : 0;
    console.log([pad(b.label, 20), pad(n, 8, true), pad(fmtPct(share), 10, true)].join("  "));
  }

  const fullPay2nd = bandCounts.get("0% (no discount)") ?? 0;
  const fullPayShare = secondInWindow.length > 0 ? (fullPay2nd / secondInWindow.length) * 100 : 0;
  console.log(`\n→ ${fmtPct(fullPayShare)} of in-window 2nd orders ALREADY pay full retail — these are the buyers a card would be a margin transfer to`);

  // ─── Cut 4: Quantity distribution of 2nd orders inside 30d ─────────
  console.log("\n## Cut 4 — Unit count on 2nd orders inside 30 days");
  console.log("─".repeat(78));

  const unitBuckets = new Map<string, number>();
  for (let i = 1; i <= 5; i++) unitBuckets.set(String(i), 0);
  unitBuckets.set("6+", 0);
  for (const o of secondInWindow) {
    const b = o.total_units >= 6 ? "6+" : String(o.total_units);
    unitBuckets.set(b, (unitBuckets.get(b) ?? 0) + 1);
  }

  console.log([pad("units", 8), pad("orders", 8, true), pad("share", 10, true)].join("  "));
  console.log("-".repeat(30));
  let single = 0;
  for (const k of ["1", "2", "3", "4", "5", "6+"]) {
    const n = unitBuckets.get(k) ?? 0;
    const share = secondInWindow.length > 0 ? (n / secondInWindow.length) * 100 : 0;
    if (k === "1") single = n;
    console.log([pad(k, 8), pad(n, 8, true), pad(fmtPct(share), 10, true)].join("  "));
  }

  const singleShare = secondInWindow.length > 0 ? (single / secondInWindow.length) * 100 : 0;
  console.log(`\n→ ${fmtPct(singleShare)} of in-window 2nd orders are single buckles — matches the card's "next buckle" framing`);

  // ─── Cut 5: Break-even sensitivity ──────────────────────────────────
  console.log("\n## Cut 5 — Break-even sensitivity");
  console.log("─".repeat(78));
  console.log(`Assumptions (tunable):`);
  console.log(`  Card discount: $${CARD_DISCOUNT_USD} ($${FULL_PRICE_USD} retail → $${FULL_PRICE_USD - CARD_DISCOUNT_USD})`);
  console.log(`  COGS per unit: $${COGS_PER_UNIT_USD} (M1 SS / M4; M1 Ti is $4.50)`);
  console.log(`  Full-price contribution: $${(FULL_PRICE_USD - COGS_PER_UNIT_USD).toFixed(2)} per buckle = ${(((FULL_PRICE_USD - COGS_PER_UNIT_USD) / FULL_PRICE_USD) * 100).toFixed(1)}% gross margin`);
  console.log(`  Print cost per card: $${PRINT_COST_PER_CARD_USD}`);
  console.log(`  Total cards printed: 1 per order in window = ${firstOrders.length}`);
  console.log("");

  // Per-card economics
  const fullPriceContrib = FULL_PRICE_USD - COGS_PER_UNIT_USD;
  const cardPriceContrib = fullPriceContrib - CARD_DISCOUNT_USD; // contribution at $29 price
  console.log(`Per-redemption contribution: $${cardPriceContrib.toFixed(2)} (incremental buyer at $29)`);
  console.log(`Per-non-incremental redemption: -$${CARD_DISCOUNT_USD} (margin transfer; they'd have paid full)`);
  console.log("");

  // For each combination of redemption rate and assumed-incremental-fraction,
  // compute net per card distributed
  const redemptionRates = [0.10, 0.15, 0.20, 0.25, 0.30];
  const incrementalFractions = [0.20, 0.40, 0.50, 0.60, 0.80];

  console.log("Net contribution per CARD DISTRIBUTED (negative = card loses money):");
  console.log("");
  console.log(
    [pad("redemption %", 14, true), ...incrementalFractions.map((f) => pad(`inc=${(f * 100).toFixed(0)}%`, 10, true))].join("  "),
  );
  console.log("-".repeat(70));
  for (const r of redemptionRates) {
    const cells: string[] = [];
    cells.push(pad(`${(r * 100).toFixed(0)}%`, 14, true));
    for (const f of incrementalFractions) {
      const incPerCard = r * f;
      const nonIncPerCard = r * (1 - f);
      const benefit = incPerCard * cardPriceContrib;
      const margTransfer = nonIncPerCard * CARD_DISCOUNT_USD;
      const net = benefit - margTransfer - PRINT_COST_PER_CARD_USD;
      cells.push(pad(`$${net.toFixed(2)}`, 10, true));
    }
    console.log(cells.join("  "));
  }
  console.log("");

  // Break-even incremental fraction at each redemption rate
  console.log("Break-even incremental fraction (f) at each redemption rate:");
  console.log("(f = fraction of redemptions that are NEW orders that wouldn't have happened)");
  console.log("");
  console.log([pad("redemption %", 14, true), pad("break-even f", 14, true)].join("  "));
  console.log("-".repeat(32));
  for (const r of redemptionRates) {
    // r*f*card_contrib - r*(1-f)*discount - print = 0
    // r*f*card_contrib + r*f*discount = r*discount + print
    // r*f*(card_contrib + discount) = r*discount + print
    // f = (r*discount + print) / (r*(card_contrib + discount))
    const f = (r * CARD_DISCOUNT_USD + PRINT_COST_PER_CARD_USD) / (r * (cardPriceContrib + CARD_DISCOUNT_USD));
    console.log([pad(`${(r * 100).toFixed(0)}%`, 14, true), pad(`${(f * 100).toFixed(1)}%`, 14, true)].join("  "));
  }

  // ─── Cut 6: Anchor against actual data ──────────────────────────────
  console.log("\n## Cut 6 — Implied required lift over the measured baseline");
  console.log("─".repeat(78));
  console.log(`Measured baseline 30-day repeat rate R0 = ${fmtPct(R0 * 100)}`);
  console.log("");
  console.log("Card mechanic: every customer gets a card.");
  console.log("Card redemption rate R = R0 + ΔR (everyone who repeats inside 30d uses the available code,");
  console.log("approximately — minus a small 'lost the card' fraction).");
  console.log("");
  console.log("For each assumed card-induced lift ΔR, what's the net contribution per card distributed?");
  console.log("(Assumes 90% of in-window repeats use the code; rest lost/forgot)");
  console.log("");
  const cardUsageRate = 0.9;
  const lifts = [0.00, 0.02, 0.05, 0.08, 0.10, 0.15, 0.20];
  console.log([pad("ΔR (pp lift)", 14, true), pad("redemption R", 14, true), pad("inc fraction f", 16, true), pad("net per card", 14, true)].join("  "));
  console.log("-".repeat(62));
  for (const dR of lifts) {
    const totalRepeatRate = R0 + dR;
    const redemptionRate = totalRepeatRate * cardUsageRate;
    const f = totalRepeatRate > 0 ? dR / totalRepeatRate : 0;
    const incPerCard = redemptionRate * f;
    const nonIncPerCard = redemptionRate * (1 - f);
    const benefit = incPerCard * cardPriceContrib;
    const margTransfer = nonIncPerCard * CARD_DISCOUNT_USD;
    const net = benefit - margTransfer - PRINT_COST_PER_CARD_USD;
    console.log(
      [
        pad(`${(dR * 100).toFixed(0)} pp`, 14, true),
        pad(`${(redemptionRate * 100).toFixed(1)}%`, 14, true),
        pad(`${(f * 100).toFixed(1)}%`, 16, true),
        pad(`$${net.toFixed(2)}`, 14, true),
      ].join("  "),
    );
  }
  console.log("");

  // Total program net (over all cards printed in window)
  console.log(`Total cards in window: ${firstOrders.length} (= number of first orders)`);
  console.log("");
  console.log("Total program NET CONTRIBUTION at each lift assumption:");
  console.log([pad("ΔR (pp lift)", 14, true), pad("net total", 16, true)].join("  "));
  console.log("-".repeat(36));
  for (const dR of lifts) {
    const totalRepeatRate = R0 + dR;
    const redemptionRate = totalRepeatRate * cardUsageRate;
    const f = totalRepeatRate > 0 ? dR / totalRepeatRate : 0;
    const incPerCard = redemptionRate * f;
    const nonIncPerCard = redemptionRate * (1 - f);
    const benefit = incPerCard * cardPriceContrib;
    const margTransfer = nonIncPerCard * CARD_DISCOUNT_USD;
    const net = (benefit - margTransfer - PRINT_COST_PER_CARD_USD) * firstOrders.length;
    console.log([pad(`${(dR * 100).toFixed(0)} pp`, 14, true), pad(`$${net.toFixed(0)}`, 16, true)].join("  "));
  }

  console.log("\n" + "─".repeat(78));
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
