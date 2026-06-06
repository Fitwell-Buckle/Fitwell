/**
 * Bundle-strategy analysis — sizes the right bundle for the 360 Workstream 1
 * §2 offer stack. The original v3.1 ladder ($40 / $92 / $134 for 1 / 3 / 5
 * packs) was scoped before we had demand-curve or discount-surface data;
 * this script informs the redesign.
 *
 * Cuts against the prod `order` + `order_line_item` tables:
 *
 *   1. Units-per-order distribution. Histogram of 1, 2, 3, 4, 5, 6+ buckets.
 *      Which adjacent demand tier should the bundle target?
 *
 *   2. Discount usage. % of orders with any discount, plus discount-rate
 *      percentiles. What does the de-facto realized price ladder look like?
 *
 *   3. Frontline vs realized ASP per unit. Σ(line-item price × qty) (the
 *      retail frontline subtotal) vs realized item revenue (subtotal_price -
 *      total_discounts). Cross-tab against units-per-order bucket.
 *
 *   4. For orders with units >= 3, what discount % did they already pay?
 *      Quantifies the margin transfer a public 3-pack would create.
 *
 *   5. Shipping behavior by units bucket. Confirms whether "free shipping
 *      at 2+" is the existing implicit 2-pack incentive and measures how
 *      often it actually fires.
 *
 *   6. Discount usage × order position (1st vs 2nd+). Separates acquisition
 *      codes (welcome flow) from retention codes (review-leaver, creator
 *      codes like watchbros15) within the 15-20% band.
 *
 *   7. Repeat behavior by first-order units. Of customers whose first order
 *      was N units, what % came back, and when? Validates the cohort the
 *      D30 outfit-the-collection post-purchase code would target.
 *
 * D2C only: excludes `source_name = 'shopify_draft_order'` (wholesale draft
 * orders); NULL source_name is treated as D2C per the funnel/strategy filter
 * pattern (src/lib/funnel/strategy.ts). Cancelled orders excluded.
 *
 * Window: Nov 1 2025 → today (full D2C history; matches the personas
 * Distribution baseline).
 *
 * Run:
 *   npx vercel --global-config ~/.vercel-fitwell env pull \
 *     .env.production.local --environment=production --yes
 *   npx dotenv -e .env.production.local -- node --import tsx/esm \
 *     scripts/bundle-strategy-analysis.ts
 *   rm -f .env.production.local
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const WINDOW_START = "2025-11-01";

// ─── Helpers ────────────────────────────────────────────────────────

const fmt$ = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtPct = (n: number, digits = 1) =>
  `${n.toFixed(digits)}%`;

const pad = (s: string | number, w: number, right = false) =>
  right ? String(s).padStart(w) : String(s).padEnd(w);

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.floor((p / 100) * sortedAsc.length),
  );
  return sortedAsc[idx];
}

function bucketUnits(units: number): string {
  if (units <= 0) return "0";
  if (units >= 6) return "6+";
  return String(units);
}

// ─── Data layer ─────────────────────────────────────────────────────

type OrderRow = {
  id: string;
  customer_id: string | null;
  processed_at: Date | null;
  subtotal_price_cents: number;
  total_discounts_cents: number;
  total_price_cents: number;
  total_shipping_cents: number;
  total_units: number;
  line_item_count: number;
  frontline_cents: number;
  order_position: number; // 1 = first order for that customer, 2 = second, ...
};

async function loadOrders(): Promise<OrderRow[]> {
  // Frontline = Σ(line_item.price × line_item.quantity) — the pre-discount
  // retail subtotal at line-item grain. subtotal_price already reflects the
  // same number but we recompute to surface any drift between the two.
  //
  // order_position is the customer's 1-indexed order sequence by processed_at.
  // Guest orders (customer_id IS NULL) get a synthetic per-order partition so
  // they always look like first orders, which matches their actual behavior.
  const result = await db.execute(sql`
    SELECT
      o.id,
      o.customer_id,
      o.processed_at,
      COALESCE(o.subtotal_price, 0)::int                       AS subtotal_price_cents,
      COALESCE(o.total_discounts, 0)::int                      AS total_discounts_cents,
      COALESCE(o.total_price, 0)::int                          AS total_price_cents,
      COALESCE(o.total_shipping, 0)::int                       AS total_shipping_cents,
      COALESCE(li_agg.total_units, 0)::int                     AS total_units,
      COALESCE(li_agg.line_item_count, 0)::int                 AS line_item_count,
      COALESCE(li_agg.frontline_cents, 0)::int                 AS frontline_cents,
      ROW_NUMBER() OVER (
        PARTITION BY COALESCE(o.customer_id, 'guest:' || o.id)
        ORDER BY o.processed_at
      )::int                                                   AS order_position
    FROM "order" o
    LEFT JOIN (
      SELECT
        order_id,
        SUM(quantity)::int           AS total_units,
        COUNT(*)::int                AS line_item_count,
        SUM(price * quantity)::int   AS frontline_cents
      FROM order_line_item
      GROUP BY order_id
    ) li_agg ON li_agg.order_id = o.id
    WHERE o.cancelled_at IS NULL
      AND (o.source_name IS NULL OR o.source_name != 'shopify_draft_order')
      AND o.processed_at IS NOT NULL
      AND o.processed_at >= ${WINDOW_START}::date
  `);
  const rows: OrderRow[] =
    (result as unknown as { rows?: OrderRow[] }).rows ??
    (result as unknown as OrderRow[]);
  return rows;
}

async function loadSourceNameMix() {
  const result = await db.execute(sql`
    SELECT
      COALESCE(source_name, '(null)') AS source_name,
      COUNT(*)::int                   AS orders,
      SUM(COALESCE(total_price, 0))::bigint AS revenue_cents
    FROM "order"
    WHERE cancelled_at IS NULL
      AND processed_at IS NOT NULL
      AND processed_at >= ${WINDOW_START}::date
    GROUP BY source_name
    ORDER BY orders DESC
  `);
  return (result as unknown as { rows?: Array<{ source_name: string; orders: number; revenue_cents: string }> }).rows ??
    (result as unknown as Array<{ source_name: string; orders: number; revenue_cents: string }>);
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("─".repeat(78));
  console.log("BUNDLE STRATEGY ANALYSIS");
  console.log(`Window: ${WINDOW_START} → today (full D2C history)`);
  console.log("D2C only: source_name != 'shopify_draft_order' (NULL treated as D2C)");
  console.log("Cancelled orders excluded");
  console.log("─".repeat(78));

  // Sanity-check: source_name distribution
  console.log("\n## source_name distribution (pre-filter — sanity-check)");
  console.log("─".repeat(78));
  const sourceMix = await loadSourceNameMix();
  console.log(
    [
      pad("source_name", 26),
      pad("orders", 8, true),
      pad("revenue", 13, true),
    ].join("  "),
  );
  console.log("-".repeat(50));
  for (const r of sourceMix) {
    console.log(
      [
        pad(r.source_name, 26),
        pad(r.orders, 8, true),
        pad(fmt$(Number(r.revenue_cents)), 13, true),
      ].join("  "),
    );
  }

  const orders = await loadOrders();
  console.log(`\nD2C orders loaded: ${orders.length}`);

  // Filter to orders with at least one unit (orders with zero units in the
  // line-item join are corrupted / non-product orders)
  const valid = orders.filter((o) => o.total_units > 0);
  const dropped = orders.length - valid.length;
  if (dropped > 0) {
    console.log(`Dropped ${dropped} orders with zero units (no line items joined).`);
  }

  const totalRevenueCents = valid.reduce(
    (s, o) => s + o.total_price_cents,
    0,
  );
  const totalSubtotalCents = valid.reduce(
    (s, o) => s + o.subtotal_price_cents,
    0,
  );
  const totalDiscountCents = valid.reduce(
    (s, o) => s + o.total_discounts_cents,
    0,
  );
  const totalFrontlineCents = valid.reduce(
    (s, o) => s + o.frontline_cents,
    0,
  );
  const totalUnits = valid.reduce((s, o) => s + o.total_units, 0);

  console.log(`Total revenue (total_price):        ${fmt$(totalRevenueCents)}`);
  console.log(`Total subtotal (items, net disc):   ${fmt$(totalSubtotalCents - totalDiscountCents)}`);
  console.log(`Total frontline (Σ price × qty):    ${fmt$(totalFrontlineCents)}`);
  console.log(`Total discounts:                    ${fmt$(totalDiscountCents)}`);
  console.log(`Total units sold:                   ${totalUnits}`);
  console.log(`Overall realized ASP/unit:          ${fmt$((totalSubtotalCents - totalDiscountCents) / Math.max(1, totalUnits))}`);
  console.log(`Overall frontline ASP/unit:         ${fmt$(totalFrontlineCents / Math.max(1, totalUnits))}`);

  // ─── Cut 1: Units-per-order distribution ─────────────────────────
  console.log("\n## Cut 1 — Units-per-order distribution");
  console.log("─".repeat(78));
  const bucketStats = new Map<
    string,
    { orders: number; units: number; revenue: number; subtotal: number; discount: number; frontline: number }
  >();
  const bucketOrder = ["1", "2", "3", "4", "5", "6+"];
  for (const b of bucketOrder) {
    bucketStats.set(b, { orders: 0, units: 0, revenue: 0, subtotal: 0, discount: 0, frontline: 0 });
  }
  for (const o of valid) {
    const b = bucketUnits(o.total_units);
    const s = bucketStats.get(b)!;
    s.orders += 1;
    s.units += o.total_units;
    s.revenue += o.total_price_cents;
    s.subtotal += o.subtotal_price_cents;
    s.discount += o.total_discounts_cents;
    s.frontline += o.frontline_cents;
  }

  console.log(
    [
      pad("units", 6),
      pad("orders", 8, true),
      pad("% orders", 10, true),
      pad("cum %", 8, true),
      pad("units", 8, true),
      pad("% units", 9, true),
      pad("% revenue", 11, true),
    ].join("  "),
  );
  console.log("-".repeat(68));
  let cumOrders = 0;
  for (const b of bucketOrder) {
    const s = bucketStats.get(b)!;
    cumOrders += s.orders;
    const pctOrders = (100 * s.orders) / valid.length;
    const pctUnits = (100 * s.units) / totalUnits;
    const pctRev = (100 * s.revenue) / totalRevenueCents;
    const cumPct = (100 * cumOrders) / valid.length;
    console.log(
      [
        pad(b, 6),
        pad(s.orders, 8, true),
        pad(fmtPct(pctOrders), 10, true),
        pad(fmtPct(cumPct), 8, true),
        pad(s.units, 8, true),
        pad(fmtPct(pctUnits), 9, true),
        pad(fmtPct(pctRev), 11, true),
      ].join("  "),
    );
  }

  // ─── Cut 2: Discount usage distribution ──────────────────────────
  console.log("\n## Cut 2 — Discount usage distribution");
  console.log("─".repeat(78));

  // Discount rate = total_discounts / subtotal_price (cap subtotal min 1 to
  // avoid /0). Express as percent. Orders with subtotal = 0 are skipped.
  const discountRates: number[] = [];
  let anyDiscountOrders = 0;
  for (const o of valid) {
    if (o.subtotal_price_cents <= 0) continue;
    const rate =
      (100 * o.total_discounts_cents) / o.subtotal_price_cents;
    discountRates.push(rate);
    if (o.total_discounts_cents > 0) anyDiscountOrders += 1;
  }
  discountRates.sort((a, b) => a - b);

  const orderableSubtotal = valid.filter((o) => o.subtotal_price_cents > 0).length;
  console.log(`Orders with subtotal > 0:        ${orderableSubtotal}`);
  console.log(`Orders with any discount applied:${anyDiscountOrders} (${fmtPct((100 * anyDiscountOrders) / orderableSubtotal)})`);
  console.log(`Mean discount rate:              ${fmtPct(discountRates.reduce((s, r) => s + r, 0) / Math.max(1, discountRates.length), 2)}`);
  console.log(`Median (p50) discount rate:      ${fmtPct(percentile(discountRates, 50), 2)}`);
  console.log(`p75 discount rate:               ${fmtPct(percentile(discountRates, 75), 2)}`);
  console.log(`p90 discount rate:               ${fmtPct(percentile(discountRates, 90), 2)}`);
  console.log(`p95 discount rate:               ${fmtPct(percentile(discountRates, 95), 2)}`);
  console.log(`p99 discount rate:               ${fmtPct(percentile(discountRates, 99), 2)}`);
  console.log(`Max discount rate:               ${fmtPct(percentile(discountRates, 100), 2)}`);

  // Discount-rate histogram for orders that DO have a discount
  console.log("\nDistribution of discount rates among discounted orders:");
  const discountedRates = discountRates.filter((r) => r > 0);
  const discBuckets = [
    { label: "0% < x ≤ 5%", min: 0, max: 5 },
    { label: "5% < x ≤ 10%", min: 5, max: 10 },
    { label: "10% < x ≤ 15%", min: 10, max: 15 },
    { label: "15% < x ≤ 20%", min: 15, max: 20 },
    { label: "20% < x ≤ 25%", min: 20, max: 25 },
    { label: "25% < x ≤ 30%", min: 25, max: 30 },
    { label: "30% < x ≤ 40%", min: 30, max: 40 },
    { label: "40% < x ≤ 50%", min: 40, max: 50 },
    { label: ">50%", min: 50, max: Infinity },
  ];
  for (const b of discBuckets) {
    const n = discountedRates.filter((r) => r > b.min && r <= b.max).length;
    const pct = (100 * n) / Math.max(1, discountedRates.length);
    console.log(
      `  ${pad(b.label, 18)} ${pad(n, 5, true)}  (${fmtPct(pct)})`,
    );
  }

  // ─── Cut 3: Frontline vs realized ASP, cross-tabbed by units bucket ─
  console.log("\n## Cut 3 — Frontline vs realized ASP per unit (by units bucket)");
  console.log("─".repeat(78));
  console.log(
    "Realized items = subtotal_price - total_discounts (excludes tax + shipping).",
  );
  console.log("ASP/unit = realized items ÷ total units in that bucket.\n");

  console.log(
    [
      pad("units", 6),
      pad("orders", 8, true),
      pad("front ASP", 12, true),
      pad("real ASP", 12, true),
      pad("disc rate", 11, true),
      pad("3-pk equiv", 12, true),
      pad("5-pk equiv", 12, true),
    ].join("  "),
  );
  console.log("-".repeat(78));
  for (const b of bucketOrder) {
    const s = bucketStats.get(b)!;
    if (s.orders === 0) {
      console.log(
        [
          pad(b, 6),
          pad(0, 8, true),
          pad("—", 12, true),
          pad("—", 12, true),
          pad("—", 11, true),
          pad("—", 12, true),
          pad("—", 12, true),
        ].join("  "),
      );
      continue;
    }
    const realizedItems = s.subtotal - s.discount;
    const frontASP = s.frontline / s.units;
    const realASP = realizedItems / s.units;
    const discRate = s.frontline > 0 ? (100 * s.discount) / s.subtotal : 0;
    // What did buyers in this bucket actually pay for 3 / 5 units of product
    // (item revenue, not including shipping / tax)?
    const threePackEquiv = realASP * 3;
    const fivePackEquiv = realASP * 5;
    console.log(
      [
        pad(b, 6),
        pad(s.orders, 8, true),
        pad(fmt$(frontASP), 12, true),
        pad(fmt$(realASP), 12, true),
        pad(fmtPct(discRate, 2), 11, true),
        pad(fmt$(threePackEquiv), 12, true),
        pad(fmt$(fivePackEquiv), 12, true),
      ].join("  "),
    );
  }
  console.log("\nReference — current 360 plan bundle ladder:");
  console.log("  Nominal frontline: 1 × $40, 3 × $40 = $120, 5 × $40 = $200");
  console.log("  Proposed bundles:  $40 / $92 (-23.3%) / $134 (-33.0%)");

  // ─── Cut 4: The decider — discount paid by units >= 3 orders ─────
  console.log("\n## Cut 4 — Discount % already paid by orders with units >= 3");
  console.log("─".repeat(78));
  const big = valid.filter((o) => o.total_units >= 3 && o.subtotal_price_cents > 0);
  console.log(`Orders with units >= 3: ${big.length}`);
  if (big.length > 0) {
    const bigRates = big
      .map((o) => (100 * o.total_discounts_cents) / o.subtotal_price_cents)
      .sort((a, b) => a - b);
    console.log(`  mean discount:    ${fmtPct(bigRates.reduce((s, r) => s + r, 0) / bigRates.length, 2)}`);
    console.log(`  median (p50):     ${fmtPct(percentile(bigRates, 50), 2)}`);
    console.log(`  p75:              ${fmtPct(percentile(bigRates, 75), 2)}`);
    console.log(`  p90:              ${fmtPct(percentile(bigRates, 90), 2)}`);

    const big3 = valid.filter((o) => o.total_units === 3 && o.subtotal_price_cents > 0);
    const big4 = valid.filter((o) => o.total_units === 4 && o.subtotal_price_cents > 0);
    const big5 = valid.filter((o) => o.total_units === 5 && o.subtotal_price_cents > 0);
    const big6 = valid.filter((o) => o.total_units >= 6 && o.subtotal_price_cents > 0);

    console.log("\nWhat orders at each unit count actually paid (item revenue, ex tax/ship):");
    console.log(
      [
        pad("units", 8),
        pad("orders", 8, true),
        pad("mean paid", 12, true),
        pad("median paid", 13, true),
        pad("vs bundle", 11, true),
      ].join("  "),
    );
    console.log("-".repeat(58));
    const bundlePrice: Record<number, number> = { 3: 9200, 5: 13400 };
    for (const [label, bucket] of [
      ["3", big3],
      ["4", big4],
      ["5", big5],
      ["6+", big6],
    ] as [string, OrderRow[]][]) {
      if (bucket.length === 0) {
        console.log(
          [
            pad(label, 8),
            pad(0, 8, true),
            pad("—", 12, true),
            pad("—", 13, true),
            pad("—", 11, true),
          ].join("  "),
        );
        continue;
      }
      const paidEach = bucket.map((o) => o.subtotal_price_cents - o.total_discounts_cents);
      paidEach.sort((a, b) => a - b);
      const mean = paidEach.reduce((s, r) => s + r, 0) / paidEach.length;
      const med = paidEach[Math.floor(paidEach.length / 2)];
      const cmp =
        label === "3"
          ? `${fmt$(med - bundlePrice[3])} vs $92`
          : label === "5"
            ? `${fmt$(med - bundlePrice[5])} vs $134`
            : "—";
      console.log(
        [
          pad(label, 8),
          pad(bucket.length, 8, true),
          pad(fmt$(mean), 12, true),
          pad(fmt$(med), 13, true),
          pad(cmp, 11, true),
        ].join("  "),
      );
    }

    console.log("\nFor reference (frontline 3-pack math at $40 each):");
    console.log("  Buyer of 3 units at full retail would pay $120.");
    console.log("  Bundle ladder would charge $92  → 23.3% off.");
    console.log("  Buyer of 5 units at full retail would pay $200.");
    console.log("  Bundle ladder would charge $134 → 33.0% off.");
    console.log(
      "  Compare the 'median paid' column to $92 / $134 above —" +
        "\n  if it's already at or below those numbers, the bundle ladder adds no leverage.",
    );
  }

  // ─── Time-window check: per-month ASP/unit drift ─────────────────
  console.log("\n## Bonus — per-month realized ASP/unit (sanity-check on window)");
  console.log("─".repeat(78));
  const monthly = new Map<
    string,
    { orders: number; units: number; subtotal: number; discount: number }
  >();
  for (const o of valid) {
    if (!o.processed_at) continue;
    const d = new Date(o.processed_at);
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const m = monthly.get(ym) ?? { orders: 0, units: 0, subtotal: 0, discount: 0 };
    m.orders += 1;
    m.units += o.total_units;
    m.subtotal += o.subtotal_price_cents;
    m.discount += o.total_discounts_cents;
    monthly.set(ym, m);
  }
  const months = [...monthly.keys()].sort();
  console.log(
    [
      pad("month", 9),
      pad("orders", 8, true),
      pad("units", 7, true),
      pad("realized ASP", 14, true),
      pad("avg disc%", 11, true),
    ].join("  "),
  );
  console.log("-".repeat(54));
  for (const m of months) {
    const s = monthly.get(m)!;
    const asp = (s.subtotal - s.discount) / Math.max(1, s.units);
    const disc = s.subtotal > 0 ? (100 * s.discount) / s.subtotal : 0;
    console.log(
      [
        pad(m, 9),
        pad(s.orders, 8, true),
        pad(s.units, 7, true),
        pad(fmt$(asp), 14, true),
        pad(fmtPct(disc, 2), 11, true),
      ].join("  "),
    );
  }

  // ─── Cut 5: Shipping behavior by units bucket ────────────────────
  console.log("\n## Cut 5 — Shipping charge by units bucket");
  console.log("─".repeat(78));
  console.log(
    "Tests whether 'free shipping at 2+' is firing — and how it actually shows up\n" +
      "vs the 1-unit baseline. total_shipping captures what the buyer was charged\n" +
      "for shipping at checkout (after free-shipping rules and discount codes).\n",
  );
  console.log(
    [
      pad("units", 6),
      pad("orders", 8, true),
      pad("mean ship", 11, true),
      pad("median", 9, true),
      pad("p75", 9, true),
      pad("% free", 9, true),
    ].join("  "),
  );
  console.log("-".repeat(60));
  for (const b of bucketOrder) {
    const inBucket = valid.filter((o) => bucketUnits(o.total_units) === b);
    if (inBucket.length === 0) {
      console.log(
        [
          pad(b, 6),
          pad(0, 8, true),
          pad("—", 11, true),
          pad("—", 9, true),
          pad("—", 9, true),
          pad("—", 9, true),
        ].join("  "),
      );
      continue;
    }
    const shipping = inBucket.map((o) => o.total_shipping_cents).sort((a, b) => a - b);
    const meanShip = shipping.reduce((s, x) => s + x, 0) / shipping.length;
    const medShip = percentile(shipping, 50);
    const p75Ship = percentile(shipping, 75);
    const freeCount = shipping.filter((x) => x === 0).length;
    console.log(
      [
        pad(b, 6),
        pad(inBucket.length, 8, true),
        pad(fmt$(meanShip), 11, true),
        pad(fmt$(medShip), 9, true),
        pad(fmt$(p75Ship), 9, true),
        pad(fmtPct((100 * freeCount) / inBucket.length, 1), 9, true),
      ].join("  "),
    );
  }
  console.log(
    "\nReads: if the 'mean ship' / 'median ship' columns drop sharply between\n" +
      "1-unit and 2-unit, the free-shipping-at-2+ policy is firing. If '% free'\n" +
      "is high at 1 unit too, free-shipping is general (not the 2+ incentive).",
  );

  // ─── Cut 6: Discount usage × order position ──────────────────────
  console.log("\n## Cut 6 — Discount usage × order position");
  console.log("─".repeat(78));
  console.log(
    "Order position 1 = customer's first order; 2+ = subsequent.\n" +
      "Separates acquisition codes (welcome flow) from retention codes\n" +
      "(review-leaver, creator codes) within the dominant 15-20% band.\n",
  );
  const firstOrders = valid.filter((o) => o.order_position === 1 && o.subtotal_price_cents > 0);
  const repeatOrders = valid.filter((o) => o.order_position >= 2 && o.subtotal_price_cents > 0);
  const summary = (label: string, set: OrderRow[]) => {
    if (set.length === 0) return;
    const withDisc = set.filter((o) => o.total_discounts_cents > 0);
    const rates = set
      .map((o) => (100 * o.total_discounts_cents) / o.subtotal_price_cents)
      .sort((a, b) => a - b);
    const meanUnits = set.reduce((s, o) => s + o.total_units, 0) / set.length;
    console.log(
      `${pad(label, 24)}  n=${pad(set.length, 5, true)}  ` +
        `% w/ discount: ${pad(fmtPct((100 * withDisc.length) / set.length), 8, true)}  ` +
        `median disc%: ${pad(fmtPct(percentile(rates, 50), 2), 7, true)}  ` +
        `p75 disc%: ${pad(fmtPct(percentile(rates, 75), 2), 7, true)}  ` +
        `avg units: ${meanUnits.toFixed(2)}`,
    );
  };
  summary("First-order (pos=1)", firstOrders);
  summary("Repeat orders (pos>=2)", repeatOrders);

  // Bucketed: at each order position, what fraction of orders carry which discount band?
  console.log("\nDiscount-band distribution by order position:");
  const bands = [
    { label: "0% (no discount)", test: (r: number) => r <= 0 },
    { label: "0% < x < 10%", test: (r: number) => r > 0 && r < 10 },
    { label: "10% ≤ x < 15%", test: (r: number) => r >= 10 && r < 15 },
    { label: "15% ≤ x ≤ 20%", test: (r: number) => r >= 15 && r <= 20 },
    { label: "20% < x ≤ 30%", test: (r: number) => r > 20 && r <= 30 },
    { label: "> 30%", test: (r: number) => r > 30 },
  ];
  console.log(
    [pad("band", 22), pad("first-order", 14, true), pad("repeat", 11, true)].join(
      "  ",
    ),
  );
  console.log("-".repeat(52));
  for (const b of bands) {
    const f = firstOrders.filter((o) =>
      b.test((100 * o.total_discounts_cents) / o.subtotal_price_cents),
    ).length;
    const r = repeatOrders.filter((o) =>
      b.test((100 * o.total_discounts_cents) / o.subtotal_price_cents),
    ).length;
    const fPct = firstOrders.length > 0 ? (100 * f) / firstOrders.length : 0;
    const rPct = repeatOrders.length > 0 ? (100 * r) / repeatOrders.length : 0;
    console.log(
      [
        pad(b.label, 22),
        pad(`${f} (${fmtPct(fPct)})`, 14, true),
        pad(`${r} (${fmtPct(rPct)})`, 11, true),
      ].join("  "),
    );
  }

  // Units distribution by order position
  console.log("\nUnits-per-order distribution by order position:");
  console.log(
    [pad("units", 6), pad("first-order", 14, true), pad("repeat", 11, true)].join(
      "  ",
    ),
  );
  console.log("-".repeat(36));
  for (const ub of bucketOrder) {
    const f = firstOrders.filter((o) => bucketUnits(o.total_units) === ub).length;
    const r = repeatOrders.filter((o) => bucketUnits(o.total_units) === ub).length;
    const fPct = firstOrders.length > 0 ? (100 * f) / firstOrders.length : 0;
    const rPct = repeatOrders.length > 0 ? (100 * r) / repeatOrders.length : 0;
    console.log(
      [
        pad(ub, 6),
        pad(`${f} (${fmtPct(fPct)})`, 14, true),
        pad(`${r} (${fmtPct(rPct)})`, 11, true),
      ].join("  "),
    );
  }

  // ─── Cut 7: Repeat rate × time-to-second-order, by first-order size ─
  console.log("\n## Cut 7 — Repeat behavior, by first-order size");
  console.log("─".repeat(78));
  console.log(
    "For customers (excludes guest orders) whose first order was N units —\n" +
      "what % came back, and how soon. Sizes the D30 outfit-the-collection code\n" +
      "audience and confirms whether 2-unit first-buyers convert into repeat /\n" +
      "outfitter behavior at a higher rate than 1-unit first-buyers.\n",
  );

  // Group orders by customer (skip guests)
  const byCustomer = new Map<string, OrderRow[]>();
  for (const o of valid) {
    if (!o.customer_id) continue;
    const list = byCustomer.get(o.customer_id) ?? [];
    list.push(o);
    byCustomer.set(o.customer_id, list);
  }
  for (const list of byCustomer.values()) {
    list.sort(
      (a, b) =>
        (a.processed_at ? new Date(a.processed_at).getTime() : 0) -
        (b.processed_at ? new Date(b.processed_at).getTime() : 0),
    );
  }
  console.log(`Identified customers (non-guest):  ${byCustomer.size}`);

  type CohortStats = {
    customers: number;
    repeatBuyers: number; // 2+ orders total
    daysToSecond: number[]; // for repeat buyers only
    totalLifetimeUnits: number;
    totalLifetimeRevenue: number; // cents
    totalLifetimeOrders: number;
  };
  const cohort: Record<string, CohortStats> = {};
  for (const b of bucketOrder) {
    cohort[b] = {
      customers: 0,
      repeatBuyers: 0,
      daysToSecond: [],
      totalLifetimeUnits: 0,
      totalLifetimeRevenue: 0,
      totalLifetimeOrders: 0,
    };
  }
  for (const list of byCustomer.values()) {
    if (list.length === 0) continue;
    const first = list[0];
    const fb = bucketUnits(first.total_units);
    const c = cohort[fb];
    c.customers += 1;
    c.totalLifetimeOrders += list.length;
    c.totalLifetimeUnits += list.reduce((s, o) => s + o.total_units, 0);
    c.totalLifetimeRevenue += list.reduce((s, o) => s + o.total_price_cents, 0);
    if (list.length > 1) {
      c.repeatBuyers += 1;
      const t1 = first.processed_at ? new Date(first.processed_at).getTime() : 0;
      const t2 = list[1].processed_at
        ? new Date(list[1].processed_at).getTime()
        : 0;
      if (t1 > 0 && t2 > t1) {
        c.daysToSecond.push((t2 - t1) / (1000 * 60 * 60 * 24));
      }
    }
  }
  console.log(
    [
      pad("first-order units", 18),
      pad("customers", 10, true),
      pad("repeat %", 10, true),
      pad("med days→2nd", 14, true),
      pad("LTV/cust", 11, true),
      pad("LT units", 10, true),
    ].join("  "),
  );
  console.log("-".repeat(80));
  for (const b of bucketOrder) {
    const c = cohort[b];
    if (c.customers === 0) {
      console.log(
        [
          pad(b, 18),
          pad(0, 10, true),
          pad("—", 10, true),
          pad("—", 14, true),
          pad("—", 11, true),
          pad("—", 10, true),
        ].join("  "),
      );
      continue;
    }
    const days = c.daysToSecond.sort((a, b) => a - b);
    const med = days.length > 0 ? days[Math.floor(days.length / 2)] : null;
    const ltv = c.totalLifetimeRevenue / c.customers;
    const lUnits = c.totalLifetimeUnits / c.customers;
    console.log(
      [
        pad(b, 18),
        pad(c.customers, 10, true),
        pad(fmtPct((100 * c.repeatBuyers) / c.customers), 10, true),
        pad(med === null ? "—" : `${med.toFixed(0)} d`, 14, true),
        pad(fmt$(ltv), 11, true),
        pad(lUnits.toFixed(2), 10, true),
      ].join("  "),
    );
  }
  console.log(
    "\nReads: if 2-unit first-buyers repeat at materially higher rates than\n" +
      "1-unit first-buyers, the 2-pack is doing acquisition-quality work, not\n" +
      "just a margin transfer. If 3+ unit first-buyers have outsized LT units,\n" +
      "those are the cohort the D30 outfit code would target — but if 1- and\n" +
      "2-unit first-buyers ALSO eventually outfit, the D30 code is broadly useful.",
  );

  console.log("\n─".repeat(26));
  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
