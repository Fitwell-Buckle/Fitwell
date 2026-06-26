import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { STORE_TZ } from "@/lib/timezone";
import type {
  ReturnDrivers,
  ReturnRow,
  LatencyRow,
} from "./return-drivers-format";

/**
 * Powers the dashboard "Return Drivers" card. Computes unit-level return rates
 * (units returned ÷ units sold, from order_refund_line vs order_line_item)
 * across nine dimensions for the DIRECT-TO-CONSUMER population.
 *
 * All-time and D2C-only by design: per-segment return rates need full history
 * to be stable, so this is intentionally independent of the dashboard's date
 * range and segment toggles (a 30-day window leaves most cells empty). Excludes
 * cancelled, $0 samples, POS, and B2B/wholesale (draft orders + company-linked).
 */

// Shared D2C filter (order aliased `o`).
const D2C = sql`
  o.is_sample = false AND o.cancelled_at IS NULL AND o.processed_at IS NOT NULL
  AND COALESCE(o.source_name,'') NOT IN ('pos','shopify_draft_order')
  AND o.customer_id NOT IN (SELECT id FROM customer WHERE company_id IS NOT NULL)
`;

// Normalization expressions shared by the product-attribute metrics.
const widthOf = (c: string) =>
  sql`COALESCE(substring(${sql.raw(c)} from '[0-9]+ ?mm'), '(no size)')`;
const colorOf = (c: string) => sql`CASE
  WHEN ${sql.raw(c)} ILIKE '%rose gold%' THEN 'Rose Gold'
  WHEN ${sql.raw(c)} ILIKE '%yellow gold%' OR ${sql.raw(c)} ILIKE '%/ gold%' THEN 'Yellow Gold'
  WHEN ${sql.raw(c)} ILIKE '%black%' THEN 'Black'
  ELSE 'Silver' END`;
const familyOf = (c: string) => sql`CASE
  WHEN ${sql.raw(c)} ILIKE '%M4%' THEN 'M4 Universal Link'
  WHEN ${sql.raw(c)} ILIKE '%tang%' THEN 'Tang (accessory)'
  WHEN ${sql.raw(c)} ILIKE '%M1%' OR ${sql.raw(c)} ILIKE '%model one%' THEN 'M1 Buckle'
  ELSE 'Other' END`;

const num = (v: unknown) => Number(v ?? 0);
const toRows = (rows: Record<string, unknown>[]): ReturnRow[] =>
  rows.map((r) => ({
    segment: String(r.segment),
    unitsSold: num(r.units_sold),
    unitsReturned: num(r.units_returned),
    pct: num(r.pct),
  }));

// Unit return rate by a product-attribute key (sold from line items, returned
// from refund lines), keyed on the same normalized expression for both.
function productMetric(keyOf: (c: string) => unknown, soldCol: string, retCol: string) {
  return db.execute(sql`
    WITH sold AS (
      SELECT ${keyOf(soldCol)} AS k, SUM(oli.quantity) AS us
      FROM order_line_item oli JOIN "order" o ON o.id = oli.order_id
      WHERE ${D2C} GROUP BY 1
    ), ret AS (
      SELECT ${keyOf(retCol)} AS k, SUM(rl.quantity) AS ur
      FROM order_refund_line rl JOIN "order" o ON o.id = rl.order_id
      WHERE ${D2C} GROUP BY 1
    )
    SELECT sold.k AS segment, sold.us AS units_sold,
      COALESCE(ret.ur, 0) AS units_returned,
      ROUND(100.0 * COALESCE(ret.ur, 0) / NULLIF(sold.us, 0), 1) AS pct
    FROM sold LEFT JOIN ret ON ret.k = sold.k
    WHERE sold.us >= 25 ORDER BY pct DESC
  `);
}

// Per-order CTE carrying units sold/returned + the order-level dimensions.
const ORD = sql`
  ord AS (
    SELECT o.id, o.total_refunded, o.processed_at,
      o.shipping_country_code AS country,
      (SELECT COALESCE(SUM(quantity),0) FROM order_line_item WHERE order_id = o.id) AS units,
      (SELECT COALESCE(SUM(quantity),0) FROM order_refund_line WHERE order_id = o.id) AS ru,
      (SELECT COUNT(*) FROM order_line_item WHERE order_id = o.id) AS lines,
      EXTRACT(HOUR FROM (o.processed_at AT TIME ZONE ${STORE_TZ})) AS hr,
      TO_CHAR(o.processed_at AT TIME ZONE ${STORE_TZ}, 'ID-Dy') AS dow,
      CASE
        WHEN c.utm_source ILIKE '%instagram%' OR c.utm_source = 'ig' OR o.referring_site ILIKE '%instagram%' THEN 'Instagram'
        WHEN c.utm_source ILIKE '%klaviyo%' OR c.utm_medium ILIKE '%email%' OR c.utm_source ILIKE '%email%' THEN 'Email'
        WHEN c.utm_source = 'fb' OR c.utm_source ILIKE '%meta%' OR c.utm_source ILIKE '%facebook%' OR o.referring_site ILIKE '%facebook%' THEN 'Facebook/Meta'
        WHEN c.utm_source ILIKE '%google%' OR o.referring_site ILIKE '%google%' THEN 'Google'
        WHEN o.referring_site ILIKE '%youtube%' THEN 'YouTube'
        WHEN (c.utm_source IS NULL OR c.utm_source = '') AND NULLIF(o.referring_site,'') IS NULL THEN 'Direct'
        ELSE 'Other' END AS came_from
    FROM "order" o LEFT JOIN customer c ON c.id = o.customer_id
    WHERE ${D2C}
  )`;

// Unit return rate grouped by an order-level dimension.
function orderMetric(dim: unknown, minUnits = 30) {
  return db.execute(sql`
    WITH ${ORD}
    SELECT ${dim} AS segment, SUM(units) AS units_sold, SUM(ru) AS units_returned,
      ROUND(100.0 * SUM(ru) / NULLIF(SUM(units), 0), 1) AS pct
    FROM ord GROUP BY 1 HAVING SUM(units) >= ${minUnits} ORDER BY pct DESC
  `);
}

export async function getReturnDrivers(): Promise<ReturnDrivers> {
  const [
    baseline,
    family,
    size,
    color,
    basket,
    latency,
    source,
    timeOfDay,
    dayOfWeek,
    country,
  ] = await Promise.all([
    db.execute(sql`
      SELECT
        (SELECT COALESCE(SUM(quantity),0) FROM order_line_item oli
           JOIN "order" o ON o.id=oli.order_id WHERE ${D2C}) AS units_sold,
        (SELECT COALESCE(SUM(quantity),0) FROM order_refund_line rl
           JOIN "order" o ON o.id=rl.order_id WHERE ${D2C}) AS units_returned
    `),
    productMetric(familyOf, "oli.title", "rl.title"),
    productMetric(widthOf, "oli.variant_title", "rl.variant_title"),
    productMetric(colorOf, "oli.variant_title", "rl.variant_title"),
    orderMetric(
      sql`CASE WHEN lines<=1 THEN '1 product' WHEN lines=2 THEN '2 products'
               WHEN lines=3 THEN '3 products' ELSE '4+ products' END`,
      1,
    ),
    // Time-to-refund: each band as a share of ALL units sold (sums to overall).
    db.execute(sql`
      WITH ${ORD}, lat AS (
        SELECT o.id, EXTRACT(DAY FROM (MIN(rl.refunded_at) - o.processed_at)) AS days,
          SUM(rl.quantity) AS ru
        FROM order_refund_line rl JOIN "order" o ON o.id = rl.order_id
        WHERE ${D2C} AND rl.refunded_at IS NOT NULL GROUP BY o.id, o.processed_at
      ), tot AS (SELECT SUM(units) AS total_units FROM ord)
      SELECT CASE
          WHEN days <= 7 THEN '≤ 7 days'
          WHEN days <= 14 THEN '8–14 days'
          WHEN days <= 30 THEN '15–30 days'
          WHEN days <= 60 THEN '31–60 days'
          ELSE '60+ days' END AS band,
        SUM(ru) AS units_returned,
        ROUND(100.0 * SUM(ru) / NULLIF((SELECT total_units FROM tot), 0), 1) AS pct_of_all
      FROM lat GROUP BY 1
      ORDER BY MIN(days)
    `),
    orderMetric(sql`came_from`, 30),
    orderMetric(
      sql`CASE WHEN hr BETWEEN 5 AND 11 THEN 'Morning (5–12)'
               WHEN hr BETWEEN 12 AND 16 THEN 'Afternoon (12–5)'
               WHEN hr BETWEEN 17 AND 21 THEN 'Evening (5–10)'
               ELSE 'Late night (10–5)' END`,
      30,
    ),
    orderMetric(sql`dow`, 30),
    orderMetric(sql`country`, 40),
  ]);

  const baseSold = num((baseline as any).rows?.[0]?.units_sold);
  const baseRet = num((baseline as any).rows?.[0]?.units_returned);

  const latencyRows: LatencyRow[] = ((latency as any).rows ?? []).map(
    (r: Record<string, unknown>) => ({
      band: String(r.band),
      unitsReturned: num(r.units_returned),
      pctOfAll: num(r.pct_of_all),
    }),
  );

  // Day-of-week comes back sorted by rate; re-sort Mon→Sun for readability.
  const dow = toRows((dayOfWeek as any).rows ?? []).sort((a, b) =>
    a.segment.localeCompare(b.segment),
  );

  return {
    baseline: {
      unitsSold: baseSold,
      unitsReturned: baseRet,
      pct: baseSold > 0 ? Math.round((1000 * baseRet) / baseSold) / 10 : 0,
    },
    family: toRows((family as any).rows ?? []),
    size: toRows((size as any).rows ?? []),
    color: toRows((color as any).rows ?? []),
    basket: toRows((basket as any).rows ?? []),
    latency: latencyRows,
    source: toRows((source as any).rows ?? []),
    timeOfDay: toRows((timeOfDay as any).rows ?? []),
    dayOfWeek: dow,
    country: toRows((country as any).rows ?? []),
  };
}
