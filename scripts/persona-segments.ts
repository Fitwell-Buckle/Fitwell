/**
 * Persona segmentation from Shopify's "Orders over time" CSV export.
 *
 * The CSV is one row per (Order ID, Line item ID, attribution-source variant).
 * Same line item appears multiple times with $0 on non-attributed rows and the
 * real $$ on the last-click row. We dedupe to one record per LINE ITEM by
 * taking the MAX values across rows, then sum per ORDER, then segment per
 * CUSTOMER. This avoids the previous bug of filtering on Orders=1 (which
 * dropped truly unattributed orders).
 */
import { readFileSync } from "node:fs";

const CSV_PATH = process.argv[2] ?? "/Users/tomsimson/Downloads/Orders over time - 2025-11-01 - 2026-05-26.csv";

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
const cReturned = col("Quantity returned (last click)");

type LineItem = {
  orderId: string;
  lineId: string;
  email: string;
  month: string;
  status: string;
  utm: string;
  referrer: string;
  campaign: string;
  qty: number;
  total: number;
  returned: number;
};

// Step 1: dedupe to one record per (Order ID, Line item ID), taking MAX numerical values.
// Attribution-only rows (Line item ID = 0 or empty) carry no line-item revenue; drop them.
const lineKey = (oid: string, lid: string) => `${oid}::${lid}`;
const lineItems = new Map<string, LineItem>();

for (const r of data) {
  const orderId = r[cOrderId];
  const lineId = r[cLineId];
  if (!orderId || orderId === "0") continue;
  if (!lineId || lineId === "0") continue; // skip attribution-only rows

  const k = lineKey(orderId, lineId);
  const qty = Number(r[cQty] || "0");
  const total = Number(r[cTotal] || "0");
  const returned = Number(r[cReturned] || "0");

  const existing = lineItems.get(k);
  if (existing) {
    existing.qty = Math.max(existing.qty, qty);
    existing.total = Math.max(existing.total, total);
    existing.returned = Math.min(existing.returned, returned); // returned is negative; take min (most-negative)
    // Keep first non-empty attribution we see
    if (!existing.utm && r[cUtm]) existing.utm = r[cUtm];
    if (!existing.referrer && r[cReferrer]) existing.referrer = r[cReferrer];
    if (!existing.campaign && r[cCampaign]) existing.campaign = r[cCampaign];
  } else {
    lineItems.set(k, {
      orderId,
      lineId,
      email: r[cEmail] ?? "",
      month: r[cMonth] ?? "",
      status: r[cStatus] ?? "",
      utm: r[cUtm] ?? "",
      referrer: r[cReferrer] ?? "",
      campaign: r[cCampaign] ?? "",
      qty,
      total,
      returned,
    });
  }
}

// Step 2: roll up to orders
type Order = {
  orderId: string;
  email: string;
  month: string;
  status: string;
  utm: string;
  referrer: string;
  campaign: string;
  qty: number;
  total: number;
  returned: number;
  lineItemCount: number;
};
const orders = new Map<string, Order>();
for (const li of lineItems.values()) {
  let o = orders.get(li.orderId);
  if (!o) {
    o = {
      orderId: li.orderId,
      email: li.email,
      month: li.month,
      status: li.status,
      utm: li.utm,
      referrer: li.referrer,
      campaign: li.campaign,
      qty: 0,
      total: 0,
      returned: 0,
      lineItemCount: 0,
    };
    orders.set(li.orderId, o);
  }
  o.qty += li.qty;
  o.total += li.total;
  o.returned += li.returned;
  o.lineItemCount += 1;
  if (!o.utm && li.utm) o.utm = li.utm;
  if (!o.referrer && li.referrer) o.referrer = li.referrer;
  if (!o.campaign && li.campaign) o.campaign = li.campaign;
}

const allOrders = [...orders.values()];
const paidOrders = allOrders.filter((o) => o.status.toLowerCase().startsWith("paid"));
const totalRevenue = paidOrders.reduce((s, o) => s + o.total, 0);

console.log(`== CSV PARSE SANITY ==`);
console.log(`CSV rows:           ${data.length}`);
console.log(`Unique line items:  ${lineItems.size}`);
console.log(`Unique orders:      ${orders.size}`);
console.log(`  paid:             ${paidOrders.length}`);
console.log(`  refunded/other:   ${allOrders.length - paidOrders.length}`);
console.log(`Total paid revenue: $${totalRevenue.toFixed(2)}`);

// Step 3: per-customer rollup across the full file window
type Customer = {
  email: string;
  firstMonth: string;
  lastMonth: string;
  orderCount: number;
  totalQty: number;
  totalSpend: number;
  utmFirst: string;
  referrerFirst: string;
  campaignFirst: string;
  orderMonths: Set<string>;
  utmMix: Set<string>;
};
const customers = new Map<string, Customer>();
const sortedOrders = [...paidOrders].sort((a, b) => a.month.localeCompare(b.month));
for (const o of sortedOrders) {
  if (!o.email) continue;
  let c = customers.get(o.email);
  if (!c) {
    c = {
      email: o.email,
      firstMonth: o.month,
      lastMonth: o.month,
      orderCount: 0,
      totalQty: 0,
      totalSpend: 0,
      utmFirst: o.utm,
      referrerFirst: o.referrer,
      campaignFirst: o.campaign,
      orderMonths: new Set(),
      utmMix: new Set(),
    };
    customers.set(o.email, c);
  }
  c.orderCount += 1;
  c.totalQty += o.qty;
  c.totalSpend += o.total;
  if (o.month > c.lastMonth) c.lastMonth = o.month;
  c.orderMonths.add(o.month);
  if (o.utm) c.utmMix.add(o.utm);
  else if (o.referrer) c.utmMix.add(`(referrer:${o.referrer})`);
  else if (o.campaign) c.utmMix.add(`(campaign:${o.campaign})`);
  else c.utmMix.add("(direct/unattributed)");
}

console.log(`\nUnique customers (paid): ${customers.size}`);
console.log(`Verify totals:           $${[...customers.values()].reduce((s, c) => s + c.totalSpend, 0).toFixed(2)}`);

// Step 4: behavioral segmentation
type Segment =
  | "P1_outfitter" // 5+ units OR 3+ orders
  | "P_curator" // 2-4 units, 1-2 orders, $80+ AOV (P1b/P2 middle)
  | "P_single_repeat" // 2 orders, single unit (came back)
  | "P_single_buyer" // 1 order, 1 unit (P4/P5 likely)
  | "P_bulk_single" // 1 order, 3+ units (gift, outfitting in one shot)
  | "B2B_like"; // 1 order, 5+ units OR $300+ single order (wholesale-shaped)

function classify(c: Customer): Segment {
  const aov = c.totalSpend / c.orderCount;
  if (c.orderCount >= 3 || c.totalQty >= 5) return "P1_outfitter";
  if (c.orderCount === 1 && (c.totalQty >= 5 || c.totalSpend >= 300)) return "B2B_like";
  if (c.orderCount === 1 && c.totalQty >= 3) return "P_bulk_single";
  if (c.orderCount === 2 && c.totalQty <= 2) return "P_single_repeat";
  if (c.totalQty >= 2 && aov >= 80) return "P_curator";
  return "P_single_buyer";
}

type SegmentStats = {
  segment: Segment;
  customers: number;
  totalSpend: number;
  avgSpend: number;
  totalQty: number;
  avgQty: number;
  avgOrders: number;
  pctCustomers: number;
  pctRevenue: number;
  samples: string[];
};

const segments = new Map<Segment, SegmentStats>();
for (const c of customers.values()) {
  const seg = classify(c);
  let s = segments.get(seg);
  if (!s) {
    s = {
      segment: seg,
      customers: 0,
      totalSpend: 0,
      avgSpend: 0,
      totalQty: 0,
      avgQty: 0,
      avgOrders: 0,
      pctCustomers: 0,
      pctRevenue: 0,
      samples: [],
    };
    segments.set(seg, s);
  }
  s.customers += 1;
  s.totalSpend += c.totalSpend;
  s.totalQty += c.totalQty;
  s.avgOrders += c.orderCount;
  if (s.samples.length < 3) s.samples.push(c.email);
}

const totalCustomers = customers.size;
const totalSpendAll = [...customers.values()].reduce((s, c) => s + c.totalSpend, 0);
for (const s of segments.values()) {
  s.avgSpend = s.totalSpend / s.customers;
  s.avgQty = s.totalQty / s.customers;
  s.avgOrders = s.avgOrders / s.customers;
  s.pctCustomers = (100 * s.customers) / totalCustomers;
  s.pctRevenue = (100 * s.totalSpend) / totalSpendAll;
}

const segmentOrder: Segment[] = [
  "B2B_like",
  "P1_outfitter",
  "P_curator",
  "P_bulk_single",
  "P_single_repeat",
  "P_single_buyer",
];
const segmentLabel: Record<Segment, string> = {
  B2B_like: "B2B-like (1 order, big)",
  P1_outfitter: "Outfitter (3+ orders OR 5+ units)",
  P_curator: "Curator (multi-unit, $80+ AOV)",
  P_bulk_single: "Bulk Single (1 order, 3-4 units)",
  P_single_repeat: "Single Repeat (2 orders, small)",
  P_single_buyer: "Single Buyer (1 order, 1 unit)",
};

console.log(`\n== BEHAVIORAL SEGMENTS (last 6 months, paid customers) ==\n`);
console.log(
  [
    "segment".padEnd(38),
    "n".padStart(5),
    "%cust".padStart(6),
    "$/cust".padStart(9),
    "total $".padStart(11),
    "%rev".padStart(6),
    "qty/c".padStart(6),
    "ord/c".padStart(6),
  ].join("  "),
);
console.log("-".repeat(96));
for (const segName of segmentOrder) {
  const s = segments.get(segName);
  if (!s) continue;
  console.log(
    [
      segmentLabel[segName].padEnd(38),
      String(s.customers).padStart(5),
      `${s.pctCustomers.toFixed(1)}%`.padStart(6),
      `$${s.avgSpend.toFixed(0)}`.padStart(9),
      `$${s.totalSpend.toFixed(0).padStart(8)}`.padStart(11),
      `${s.pctRevenue.toFixed(1)}%`.padStart(6),
      s.avgQty.toFixed(1).padStart(6),
      s.avgOrders.toFixed(2).padStart(6),
    ].join("  "),
  );
}
console.log("-".repeat(96));
console.log(
  [
    "TOTAL".padEnd(38),
    String(totalCustomers).padStart(5),
    "100.0%".padStart(6),
    `$${(totalSpendAll / totalCustomers).toFixed(0)}`.padStart(9),
    `$${totalSpendAll.toFixed(0).padStart(8)}`.padStart(11),
    "100%".padStart(6),
    "".padStart(6),
    "".padStart(6),
  ].join("  "),
);

// Step 5: top outfitters / B2B candidates (named, for sanity-check)
console.log(`\n== TOP 10 CUSTOMERS BY SPEND (likely P1 Outfitter or B2B-like) ==`);
const topSpenders = [...customers.values()].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 10);
for (const c of topSpenders) {
  console.log(
    `  $${c.totalSpend.toFixed(2).padStart(8)}  ${String(c.orderCount).padStart(2)} orders  ${String(c.totalQty).padStart(3)} units  ${c.firstMonth.slice(0, 7)}→${c.lastMonth.slice(0, 7)}  ${c.email.padEnd(35)} ${[...c.utmMix].join(",")}`,
  );
}

// Step 6: acquisition channel cut
console.log(`\n== ACQUISITION CHANNEL (first-order UTM/referrer/campaign) ==`);
const channelCounts = new Map<string, { customers: number; totalSpend: number; totalQty: number }>();
for (const c of customers.values()) {
  const channel =
    c.utmFirst || (c.referrerFirst ? `(referrer:${c.referrerFirst})` : "") || (c.campaignFirst ? `(campaign:${c.campaignFirst})` : "") || "(direct/unattributed)";
  const e = channelCounts.get(channel) ?? { customers: 0, totalSpend: 0, totalQty: 0 };
  e.customers += 1;
  e.totalSpend += c.totalSpend;
  e.totalQty += c.totalQty;
  channelCounts.set(channel, e);
}
const sortedChannels = [...channelCounts.entries()].sort((a, b) => b[1].totalSpend - a[1].totalSpend);
console.log("  channel                              customers     total $   avg $/cust   qty/cust");
console.log("  " + "-".repeat(88));
for (const [ch, e] of sortedChannels.slice(0, 15)) {
  console.log(
    `  ${ch.padEnd(36)} ${String(e.customers).padStart(9)}  $${e.totalSpend.toFixed(0).padStart(8)}     $${(e.totalSpend / e.customers).toFixed(0).padStart(5)}     ${(e.totalQty / e.customers).toFixed(2).padStart(5)}`,
  );
}

// Step 7: dump customer-level data to JSON for downstream Judge.me join
import { writeFileSync } from "node:fs";
const outPath = "/Users/tomsimson/code/Fitwell/data/customer-segments.json";
const exportData = [...customers.values()].map((c) => ({
  email: c.email,
  segment: classify(c),
  firstMonth: c.firstMonth.slice(0, 7),
  lastMonth: c.lastMonth.slice(0, 7),
  orderCount: c.orderCount,
  totalQty: c.totalQty,
  totalSpend: c.totalSpend,
  channels: [...c.utmMix],
}));
try {
  writeFileSync(outPath, JSON.stringify(exportData, null, 2));
  console.log(`\nWrote ${exportData.length} customer records to ${outPath}`);
} catch (e) {
  console.log(`\n(could not write to ${outPath}: ${(e as Error).message})`);
}
