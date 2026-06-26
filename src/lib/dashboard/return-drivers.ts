import { db } from "@/lib/db";
import { sql, type SQL } from "drizzle-orm";
import { STORE_TZ } from "@/lib/timezone";
import type {
  ReturnDrivers,
  ReturnRow,
  LatencyRow,
} from "./return-drivers-format";
import {
  FAMILY,
  COLOR,
  SOURCE,
  TOD,
  LAT,
  BASKET,
  NO_SIZE,
} from "./return-drivers-labels";

/**
 * Powers the dashboard "Return Drivers" card. Computes unit-level return rates
 * (units returned ÷ units sold, from order_refund_line vs order_line_item)
 * across nine dimensions.
 *
 * Scope tracks the dashboard's top-bar filters: the selected date range and the
 * segment toggle (all / D2C / trade-show / B2B) — same as every other card. It
 * does NOT apply the click-filters (Returns Breakdown / Return Drivers itself),
 * since this card is the selector for the latter and a returns-only denominator
 * would break the rate. Always excludes cancelled + $0 sample orders.
 */

export type ReturnDriversScope = {
  from: Date;
  to: Date;
  segment: "all" | "d2c" | "tradeshow" | "b2b";
};

// Scope predicate on the order, aliased `o` in every query below. Mirrors the
// dashboard's segmentCond (source_name based) + date range.
function buildScope({ from, to, segment }: ReturnDriversScope): SQL {
  const seg =
    segment === "d2c"
      ? sql` AND o.source_name IS DISTINCT FROM 'shopify_draft_order' AND o.source_name IS DISTINCT FROM 'pos'`
      : segment === "tradeshow"
        ? sql` AND o.source_name = 'pos'`
        : segment === "b2b"
          ? sql` AND o.source_name = 'shopify_draft_order'`
          : sql``;
  return sql`
    o.is_sample = false AND o.cancelled_at IS NULL AND o.processed_at IS NOT NULL
    AND o.processed_at >= ${from} AND o.processed_at <= ${to}${seg}`;
}

// Normalization expressions shared by the product-attribute metrics.
const widthOf = (c: string) =>
  sql`COALESCE(substring(${sql.raw(c)} from '[0-9]+ ?mm'), ${NO_SIZE})`;
const colorOf = (c: string) => sql`CASE
  WHEN ${sql.raw(c)} ILIKE '%rose gold%' THEN ${COLOR.rose}
  WHEN ${sql.raw(c)} ILIKE '%yellow gold%' OR ${sql.raw(c)} ILIKE '%/ gold%' THEN ${COLOR.yellow}
  WHEN ${sql.raw(c)} ILIKE '%black%' THEN ${COLOR.black}
  ELSE ${COLOR.silver} END`;
const familyOf = (c: string) => sql`CASE
  WHEN ${sql.raw(c)} ILIKE '%M4%' THEN ${FAMILY.m4}
  WHEN ${sql.raw(c)} ILIKE '%tang%' THEN ${FAMILY.tang}
  WHEN ${sql.raw(c)} ILIKE '%M1%' OR ${sql.raw(c)} ILIKE '%model one%' THEN ${FAMILY.m1}
  ELSE ${FAMILY.other} END`;

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
function productMetric(scope: SQL, keyOf: (c: string) => unknown, soldCol: string, retCol: string, minSold = 10) {
  return db.execute(sql`
    WITH sold AS (
      SELECT ${keyOf(soldCol)} AS k, SUM(oli.quantity) AS us
      FROM order_line_item oli JOIN "order" o ON o.id = oli.order_id
      WHERE ${scope} GROUP BY 1
    ), ret AS (
      SELECT ${keyOf(retCol)} AS k, SUM(rl.quantity) AS ur
      FROM order_refund_line rl JOIN "order" o ON o.id = rl.order_id
      WHERE ${scope} GROUP BY 1
    )
    SELECT sold.k AS segment, sold.us AS units_sold,
      COALESCE(ret.ur, 0) AS units_returned,
      ROUND(100.0 * COALESCE(ret.ur, 0) / NULLIF(sold.us, 0), 1) AS pct
    FROM sold LEFT JOIN ret ON ret.k = sold.k
    WHERE sold.us >= ${minSold} ORDER BY pct DESC
  `);
}

// Per-order CTE carrying units sold/returned + the order-level dimensions.
function ordCte(scope: SQL): SQL {
  return sql`
    ord AS (
      SELECT o.id, o.total_refunded, o.processed_at,
        o.shipping_country_code AS country,
        (SELECT COALESCE(SUM(quantity),0) FROM order_line_item WHERE order_id = o.id) AS units,
        (SELECT COALESCE(SUM(quantity),0) FROM order_refund_line WHERE order_id = o.id) AS ru,
        (SELECT COUNT(*) FROM order_line_item WHERE order_id = o.id) AS lines,
        EXTRACT(HOUR FROM (o.processed_at AT TIME ZONE ${STORE_TZ})) AS hr,
        TO_CHAR(o.processed_at AT TIME ZONE ${STORE_TZ}, 'ID-Dy') AS dow,
        CASE
          WHEN c.utm_source ILIKE '%instagram%' OR c.utm_source = 'ig' OR o.referring_site ILIKE '%instagram%' THEN ${SOURCE.instagram}
          WHEN c.utm_source ILIKE '%klaviyo%' OR c.utm_medium ILIKE '%email%' OR c.utm_source ILIKE '%email%' THEN ${SOURCE.email}
          WHEN c.utm_source = 'fb' OR c.utm_source ILIKE '%meta%' OR c.utm_source ILIKE '%facebook%' OR o.referring_site ILIKE '%facebook%' THEN ${SOURCE.facebook}
          WHEN c.utm_source ILIKE '%google%' OR o.referring_site ILIKE '%google%' THEN ${SOURCE.google}
          WHEN o.referring_site ILIKE '%youtube%' THEN ${SOURCE.youtube}
          WHEN (c.utm_source IS NULL OR c.utm_source = '') AND NULLIF(o.referring_site,'') IS NULL THEN ${SOURCE.direct}
          ELSE ${SOURCE.other} END AS came_from
      FROM "order" o LEFT JOIN customer c ON c.id = o.customer_id
      WHERE ${scope}
    )`;
}

// Unit return rate grouped by an order-level dimension.
function orderMetric(ord: SQL, dim: unknown, minUnits = 10) {
  return db.execute(sql`
    WITH ${ord}
    SELECT ${dim} AS segment, SUM(units) AS units_sold, SUM(ru) AS units_returned,
      ROUND(100.0 * SUM(ru) / NULLIF(SUM(units), 0), 1) AS pct
    FROM ord GROUP BY 1 HAVING SUM(units) >= ${minUnits} ORDER BY pct DESC
  `);
}

export async function getReturnDrivers(opts: ReturnDriversScope): Promise<ReturnDrivers> {
  const scope = buildScope(opts);
  const ord = ordCte(scope);
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
           JOIN "order" o ON o.id=oli.order_id WHERE ${scope}) AS units_sold,
        (SELECT COALESCE(SUM(quantity),0) FROM order_refund_line rl
           JOIN "order" o ON o.id=rl.order_id WHERE ${scope}) AS units_returned
    `),
    productMetric(scope, familyOf, "oli.title", "rl.title"),
    productMetric(scope, widthOf, "oli.variant_title", "rl.variant_title"),
    productMetric(scope, colorOf, "oli.variant_title", "rl.variant_title"),
    orderMetric(
      ord,
      sql`CASE WHEN lines<=1 THEN ${BASKET.one} WHEN lines=2 THEN ${BASKET.two}
               WHEN lines=3 THEN ${BASKET.three} ELSE ${BASKET.four} END`,
      1,
    ),
    // Time-to-refund: each band as a share of ALL units sold (sums to overall).
    db.execute(sql`
      WITH ${ord}, lat AS (
        SELECT o.id, EXTRACT(DAY FROM (MIN(rl.refunded_at) - o.processed_at)) AS days,
          SUM(rl.quantity) AS ru
        FROM order_refund_line rl JOIN "order" o ON o.id = rl.order_id
        WHERE ${scope} AND rl.refunded_at IS NOT NULL GROUP BY o.id, o.processed_at
      ), tot AS (SELECT SUM(units) AS total_units FROM ord)
      SELECT CASE
          WHEN days <= 7 THEN ${LAT.d7}
          WHEN days <= 14 THEN ${LAT.d14}
          WHEN days <= 30 THEN ${LAT.d30}
          WHEN days <= 60 THEN ${LAT.d60}
          ELSE ${LAT.d61} END AS band,
        SUM(ru) AS units_returned,
        ROUND(100.0 * SUM(ru) / NULLIF((SELECT total_units FROM tot), 0), 1) AS pct_of_all
      FROM lat GROUP BY 1
      ORDER BY MIN(days)
    `),
    orderMetric(ord, sql`came_from`, 10),
    orderMetric(
      ord,
      sql`CASE WHEN hr BETWEEN 5 AND 11 THEN ${TOD.morning}
               WHEN hr BETWEEN 12 AND 16 THEN ${TOD.afternoon}
               WHEN hr BETWEEN 17 AND 21 THEN ${TOD.evening}
               ELSE ${TOD.late} END`,
      10,
    ),
    orderMetric(ord, sql`dow`, 10),
    orderMetric(ord, sql`country`, 10),
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
