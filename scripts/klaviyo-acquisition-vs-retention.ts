/**
 * Quantifies the Klaviyo acquisition (welcome flow) vs retention
 * (post-purchase flows) split — tests H12 in hypotheses.md.
 *
 * Approach:
 *   1. Parse the Shopify "Orders over time" CSV.
 *   2. Dedupe to one record per (Order ID, Line item ID), but
 *      ALSO collect every distinct UTM / campaign / referrer value
 *      that appeared across rows for that order — so we can mark
 *      "Klaviyo touched this order at any point in its attribution
 *      chain," not just "Klaviyo was last-click."
 *   3. For each customer, sort their orders by month and assign a
 *      sequence number (1, 2, 3, ...).
 *   4. Filter to Klaviyo-touched orders. Split by sequence:
 *        seq == 1 → acquisition (welcome flow)
 *        seq >  1 → retention (post-purchase flows)
 *   5. Report counts, revenue, customer overlap, and the LTV trail
 *      for welcome-flow-acquired customers (do they keep buying?).
 */
import { readFileSync } from "node:fs";

const CSV_PATH =
  process.argv[2] ??
  "/Users/tomsimson/Downloads/Orders over time - 2025-11-01 - 2026-05-26.csv";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
    } else {
      if (c === '"') {
        inQuotes = true;
        i++;
      } else if (c === ",") {
        row.push(field);
        field = "";
        i++;
      } else if (c === "\n" || c === "\r") {
        row.push(field);
        rows.push(row);
        field = "";
        row = [];
        if (c === "\r" && text[i + 1] === "\n") i += 2;
        else i++;
      } else {
        field += c;
        i++;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].length > 0));
}

const raw = readFileSync(CSV_PATH, "utf-8");
const rows = parseCsv(raw);
const header = rows[0];
const data = rows.slice(1);

const col = (name: string) => header.indexOf(name);
const cMonth = col("Month");
const cEmail = col("Customer email");
const cOrderId = col("Order ID");
const cStatus = col("Order payment status");
const cUtm = col("Order UTM source");
const cReferrer = col("Order referrer source");
const cCampaign = col("UTM campaign source");
const cLineId = col("Line item ID");
const cQty = col("Quantity ordered per order (last click)");
const cTotal = col("Total sales (last click)");

type OrderAgg = {
  orderId: string;
  email: string;
  month: string;
  status: string;
  total: number;
  qty: number;
  utmValues: Set<string>; // all distinct UTM source values across rows
  campaignValues: Set<string>; // all distinct campaign source values across rows
  referrerValues: Set<string>; // all distinct referrer source values across rows
  lineItems: Map<string, { total: number; qty: number }>; // line item id → max(total, qty)
};

const orders = new Map<string, OrderAgg>();

for (const r of data) {
  const orderId = r[cOrderId];
  if (!orderId || orderId === "0") continue;

  let o = orders.get(orderId);
  if (!o) {
    o = {
      orderId,
      email: r[cEmail] ?? "",
      month: r[cMonth] ?? "",
      status: r[cStatus] ?? "",
      total: 0,
      qty: 0,
      utmValues: new Set(),
      campaignValues: new Set(),
      referrerValues: new Set(),
      lineItems: new Map(),
    };
    orders.set(orderId, o);
  }

  // Collect every distinct UTM-style attribution we see for this order
  if (r[cUtm]) o.utmValues.add(r[cUtm]);
  if (r[cCampaign]) o.campaignValues.add(r[cCampaign]);
  if (r[cReferrer]) o.referrerValues.add(r[cReferrer]);

  // Dedupe line items: take MAX values across attribution-source rows for each line item
  const lineId = r[cLineId];
  if (lineId && lineId !== "0") {
    const total = Number(r[cTotal] || "0");
    const qty = Number(r[cQty] || "0");
    const existing = o.lineItems.get(lineId);
    if (existing) {
      existing.total = Math.max(existing.total, total);
      existing.qty = Math.max(existing.qty, qty);
    } else {
      o.lineItems.set(lineId, { total, qty });
    }
  }
}

// Sum line items into order totals
for (const o of orders.values()) {
  for (const li of o.lineItems.values()) {
    o.total += li.total;
    o.qty += li.qty;
  }
}

const paidOrders = [...orders.values()].filter((o) =>
  o.status.toLowerCase().startsWith("paid"),
);

// Klaviyo-touched detection: case-insensitive substring match in any UTM / campaign field
function isKlaviyoTouched(o: OrderAgg): boolean {
  const needle = "klaviyo";
  const inSet = (s: Set<string>) =>
    [...s].some((v) => v.toLowerCase().includes(needle));
  return inSet(o.utmValues) || inSet(o.campaignValues);
}

const klaviyoOrders = paidOrders.filter(isKlaviyoTouched);

// Per-customer order sequence
const ordersByCustomer = new Map<string, OrderAgg[]>();
for (const o of paidOrders) {
  if (!o.email) continue;
  const list = ordersByCustomer.get(o.email) ?? [];
  list.push(o);
  ordersByCustomer.set(o.email, list);
}
for (const list of ordersByCustomer.values()) {
  list.sort((a, b) => a.month.localeCompare(b.month));
}

function orderSequence(email: string, orderId: string): number {
  const list = ordersByCustomer.get(email) ?? [];
  const idx = list.findIndex((x) => x.orderId === orderId);
  return idx + 1;
}

// Classify each Klaviyo order
type Bucket = "acquisition" | "retention";
type ClassifiedOrder = OrderAgg & { sequence: number; bucket: Bucket };

const classified: ClassifiedOrder[] = klaviyoOrders
  .filter((o) => o.email)
  .map((o) => {
    const seq = orderSequence(o.email, o.orderId);
    return {
      ...o,
      sequence: seq,
      bucket: seq === 1 ? "acquisition" : "retention",
    } as ClassifiedOrder;
  });

const fmt$ = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

console.log(`== INPUT ==`);
console.log(`Paid orders in file:                ${paidOrders.length}`);
console.log(`Paid orders Klaviyo-touched:        ${klaviyoOrders.length}`);
console.log(
  `Klaviyo-touched orders missing email: ${klaviyoOrders.length - classified.length}`,
);
const totalPaidRev = paidOrders.reduce((s, o) => s + o.total, 0);
const totalKlaviyoRev = classified.reduce((s, o) => s + o.total, 0);
console.log(`Total paid revenue:                 ${fmt$(totalPaidRev)}`);
console.log(
  `Total Klaviyo-touched revenue:      ${fmt$(totalKlaviyoRev)}  (${((100 * totalKlaviyoRev) / totalPaidRev).toFixed(1)}% of all paid revenue)`,
);

// Aggregate by bucket
type BucketStats = {
  bucket: Bucket;
  orders: number;
  customers: Set<string>;
  revenue: number;
  units: number;
};
const buckets: Record<Bucket, BucketStats> = {
  acquisition: {
    bucket: "acquisition",
    orders: 0,
    customers: new Set(),
    revenue: 0,
    units: 0,
  },
  retention: {
    bucket: "retention",
    orders: 0,
    customers: new Set(),
    revenue: 0,
    units: 0,
  },
};
for (const o of classified) {
  const b = buckets[o.bucket];
  b.orders += 1;
  b.customers.add(o.email);
  b.revenue += o.total;
  b.units += o.qty;
}

console.log(`\n== KLAVIYO ACQUISITION vs RETENTION SPLIT ==\n`);
console.log(
  [
    "bucket".padEnd(15),
    "orders".padStart(7),
    "customers".padStart(10),
    "revenue".padStart(12),
    "% klav rev".padStart(11),
    "units".padStart(7),
    "$/order".padStart(9),
    "$/customer".padStart(11),
  ].join("  "),
);
console.log("-".repeat(96));
for (const bucket of ["acquisition", "retention"] as Bucket[]) {
  const b = buckets[bucket];
  const pctRev = totalKlaviyoRev > 0 ? (100 * b.revenue) / totalKlaviyoRev : 0;
  const perOrder = b.orders > 0 ? b.revenue / b.orders : 0;
  const perCust = b.customers.size > 0 ? b.revenue / b.customers.size : 0;
  console.log(
    [
      bucket.padEnd(15),
      String(b.orders).padStart(7),
      String(b.customers.size).padStart(10),
      fmt$(b.revenue).padStart(12),
      `${pctRev.toFixed(1)}%`.padStart(11),
      String(b.units).padStart(7),
      fmt$(perOrder).padStart(9),
      fmt$(perCust).padStart(11),
    ].join("  "),
  );
}

// Acquisition customers — do they keep buying? (test the "welcome flow filters for high-quality customers" question)
const acqCustomers = [...buckets.acquisition.customers];
const acqCustomerHistory = acqCustomers.map((email) => {
  const list = ordersByCustomer.get(email) ?? [];
  const total = list.reduce((s, o) => s + o.total, 0);
  const units = list.reduce((s, o) => s + o.qty, 0);
  return { email, totalOrders: list.length, totalRevenue: total, totalUnits: units };
});

const acqLifetime = acqCustomerHistory.reduce(
  (acc, c) => {
    acc.revenue += c.totalRevenue;
    acc.orders += c.totalOrders;
    acc.units += c.totalUnits;
    if (c.totalOrders > 1) acc.repeatBuyers += 1;
    return acc;
  },
  { revenue: 0, orders: 0, units: 0, repeatBuyers: 0 },
);

console.log(`\n== WELCOME-FLOW ACQUIRED CUSTOMERS — full LTV trail ==\n`);
console.log(`Welcome-flow acquired customers:   ${acqCustomers.length}`);
console.log(
  `  Average total orders/customer:   ${(acqLifetime.orders / acqCustomers.length).toFixed(2)}`,
);
console.log(
  `  Average total units/customer:    ${(acqLifetime.units / acqCustomers.length).toFixed(2)}`,
);
console.log(
  `  Average total LTV/customer:      ${fmt$(acqLifetime.revenue / acqCustomers.length)}`,
);
console.log(
  `  % who became repeat buyers:      ${((100 * acqLifetime.repeatBuyers) / acqCustomers.length).toFixed(1)}%`,
);

// Baseline comparison: all non-welcome-flow customers
const allCustomerEmails = [...ordersByCustomer.keys()];
const nonAcq = allCustomerEmails.filter((e) => !buckets.acquisition.customers.has(e));
const nonAcqLifetime = nonAcq.reduce(
  (acc, email) => {
    const list = ordersByCustomer.get(email) ?? [];
    acc.revenue += list.reduce((s, o) => s + o.total, 0);
    acc.orders += list.length;
    acc.units += list.reduce((s, o) => s + o.qty, 0);
    if (list.length > 1) acc.repeatBuyers += 1;
    return acc;
  },
  { revenue: 0, orders: 0, units: 0, repeatBuyers: 0 },
);

console.log(`\n== BASELINE: non-welcome-flow customers ==\n`);
console.log(`Non-welcome-flow customers:        ${nonAcq.length}`);
console.log(
  `  Average total orders/customer:   ${(nonAcqLifetime.orders / nonAcq.length).toFixed(2)}`,
);
console.log(
  `  Average total units/customer:    ${(nonAcqLifetime.units / nonAcq.length).toFixed(2)}`,
);
console.log(
  `  Average total LTV/customer:      ${fmt$(nonAcqLifetime.revenue / nonAcq.length)}`,
);
console.log(
  `  % who became repeat buyers:      ${((100 * nonAcqLifetime.repeatBuyers) / nonAcq.length).toFixed(1)}%`,
);

const lift =
  ((acqLifetime.revenue / acqCustomers.length) /
    (nonAcqLifetime.revenue / nonAcq.length) -
    1) *
  100;
console.log(
  `\n  → Welcome-flow customer LTV lift over baseline: ${lift >= 0 ? "+" : ""}${lift.toFixed(1)}%`,
);

// Retention customers — who are they? sequence distribution
console.log(`\n== KLAVIYO RETENTION ORDERS — sequence distribution ==\n`);
const seqCount = new Map<number, { orders: number; revenue: number }>();
for (const o of classified) {
  if (o.bucket !== "retention") continue;
  const e = seqCount.get(o.sequence) ?? { orders: 0, revenue: 0 };
  e.orders += 1;
  e.revenue += o.total;
  seqCount.set(o.sequence, e);
}
const sortedSeq = [...seqCount.entries()].sort((a, b) => a[0] - b[0]);
console.log(`  Sequence  Orders   Revenue`);
console.log(`  --------  ------   --------`);
for (const [seq, e] of sortedSeq) {
  console.log(`  ${String(seq).padEnd(8)}  ${String(e.orders).padStart(6)}   ${fmt$(e.revenue).padStart(8)}`);
}

// Cross-touch detail: do retention-side customers ALSO have a welcome-flow Klaviyo order?
const retCustomers = [...buckets.retention.customers];
const retCustomersAlsoAcq = retCustomers.filter((e) => buckets.acquisition.customers.has(e));
console.log(`\n== ACQUISITION × RETENTION CUSTOMER OVERLAP ==`);
console.log(`Customers in BOTH (acquired AND retained via Klaviyo): ${retCustomersAlsoAcq.length}`);
console.log(`Retention-only customers (Klaviyo retention but NOT welcome-flow-acquired): ${retCustomers.length - retCustomersAlsoAcq.length}`);
