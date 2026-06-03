/**
 * 30-day Meta attribution apples-to-apples — produces two cuts:
 *
 *   (1) Customer first-touch channel — what the dashboard shows.
 *       Each order is attributed by the buyer's customer.utm_source
 *       (parsed once from their first-ever landing_site by the
 *       Shopify sync), regardless of how this specific order
 *       arrived.
 *
 *   (2) Per-order landing-site UTM — each order is attributed by
 *       the URL the buyer landed on for THIS purchase (parsed from
 *       order.landing_site). Closer in spirit to Meta's 30-day
 *       attribution window because it asks "what did they land on
 *       for the order they actually placed."
 *
 * Output is grouped using src/lib/funnel/classify.ts mapToChannel
 * so the buckets match the dashboard. Run against the prod DB.
 */
import { neon } from "@neondatabase/serverless";
import { mapToChannel } from "@/lib/funnel/classify";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const since = new Date();
since.setDate(since.getDate() - 30);

type Row = {
  total_price: number;
  landing_site: string | null;
  customer_id: string | null;
  cust_utm_source: string | null;
  cust_utm_medium: string | null;
  cust_utm_campaign: string | null;
};

// Pull D2C-only orders in last 30 days, joined to customer for first-touch UTM.
const rows = (await sql`
  SELECT
    o.total_price,
    o.landing_site,
    o.customer_id,
    c.utm_source AS cust_utm_source,
    c.utm_medium AS cust_utm_medium,
    c.utm_campaign AS cust_utm_campaign
  FROM "order" o
  LEFT JOIN customer c ON c.id = o.customer_id
  WHERE o.processed_at >= ${since.toISOString()}
    AND (o.source_name IS NULL OR o.source_name != 'shopify_draft_order')
`) as Row[];

function parseLandingSite(url: string | null): {
  source: string | null;
  medium: string | null;
  campaign: string | null;
} {
  if (!url) return { source: null, medium: null, campaign: null };
  // landing_site can be a path like "/?utm_source=meta&..." or a full URL
  try {
    const u = url.startsWith("http") ? new URL(url) : new URL(url, "http://x");
    return {
      source: u.searchParams.get("utm_source"),
      medium: u.searchParams.get("utm_medium"),
      campaign: u.searchParams.get("utm_campaign"),
    };
  } catch {
    return { source: null, medium: null, campaign: null };
  }
}

type Agg = { orders: number; revenue: number; channel: string };

const byFirstTouch = new Map<string, Agg>();
const byOrderTouch = new Map<string, Agg>();

for (const r of rows) {
  const firstChannel = mapToChannel({
    utmSource: r.cust_utm_source,
    utmMedium: r.cust_utm_medium,
    utmCampaign: r.cust_utm_campaign,
  });
  const parsed = parseLandingSite(r.landing_site);
  const orderChannel = mapToChannel({
    utmSource: parsed.source,
    utmMedium: parsed.medium,
    utmCampaign: parsed.campaign,
  });

  const ftKey = firstChannel;
  const otKey = orderChannel;
  const price = Number(r.total_price) || 0;

  const ft = byFirstTouch.get(ftKey) ?? { orders: 0, revenue: 0, channel: ftKey };
  ft.orders += 1;
  ft.revenue += price;
  byFirstTouch.set(ftKey, ft);

  const ot = byOrderTouch.get(otKey) ?? { orders: 0, revenue: 0, channel: otKey };
  ot.orders += 1;
  ot.revenue += price;
  byOrderTouch.set(otKey, ot);
}

const totalOrders = rows.length;
const totalRevenue = rows.reduce((s, r) => s + (Number(r.total_price) || 0), 0);

function dollars(c: number) {
  return `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

console.log(
  `\nLast 30 days (since ${since.toISOString().slice(0, 10)}, D2C only):`,
);
console.log(`Total orders: ${totalOrders}, total revenue: ${dollars(totalRevenue)}\n`);

function printCut(title: string, agg: Map<string, Agg>) {
  console.log(`── ${title} ──`);
  const rows = [...agg.values()].sort((a, b) => b.orders - a.orders);
  console.log(
    [
      "channel".padEnd(34),
      "orders".padStart(7),
      "% orders".padStart(9),
      "revenue".padStart(11),
      "% rev".padStart(7),
    ].join("  "),
  );
  console.log("-".repeat(75));
  for (const r of rows) {
    const ordPct = (100 * r.orders) / totalOrders;
    const revPct = (100 * r.revenue) / totalRevenue;
    console.log(
      [
        r.channel.padEnd(34),
        String(r.orders).padStart(7),
        `${ordPct.toFixed(1)}%`.padStart(9),
        dollars(r.revenue).padStart(11),
        `${revPct.toFixed(1)}%`.padStart(7),
      ].join("  "),
    );
  }
  console.log();
}

printCut("By customer first-touch (what the dashboard shows)", byFirstTouch);
printCut("By per-order landing_site UTM (closer to Meta's window)", byOrderTouch);

// Summary line: Meta-shaped channels in each cut
function metaShape(agg: Map<string, Agg>) {
  const channels = ["paid_meta_cold", "paid_meta_retargeting", "organic_meta"];
  let orders = 0;
  for (const c of channels) {
    orders += agg.get(c)?.orders ?? 0;
  }
  return orders;
}

console.log(
  `Meta-shaped channels (paid_meta_cold + paid_meta_retargeting + organic_meta):`,
);
console.log(
  `  By customer first-touch: ${metaShape(byFirstTouch)} orders`,
);
console.log(`  By per-order landing site: ${metaShape(byOrderTouch)} orders`);
console.log(
  `  Meta's own attribution (reported by Tom): 84 orders — this is the upper bound`,
);
