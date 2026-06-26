import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * Returns analysis: what causes returns? Uses the EXACT line-level return data
 * in order_refund_line (units actually returned per product), not estimates.
 *
 * Two lenses on every dimension:
 *   - order-level "any refund" rate  = orders with a refund / orders
 *   - unit-level return rate          = units returned / units sold  (the truer
 *     "what fraction of product comes back", from order_refund_line.quantity)
 *
 * Population = DIRECT-TO-CONSUMER. Excludes cancelled, $0 samples, POS
 * (source_name='pos'), and B2B/wholesale (draft orders + company-linked
 * customers). "Silver" and "Natural (silver)" are the SAME product and are
 * normalized together.
 */

const D2C = sql`
  o.is_sample = false AND o.cancelled_at IS NULL AND o.processed_at IS NOT NULL
  AND COALESCE(o.source_name,'') NOT IN ('pos','shopify_draft_order')
  AND o.customer_id NOT IN (SELECT id FROM customer WHERE company_id IS NOT NULL)
`;

// ── normalization helpers (apply identically to sold + returned rows) ──
const width = (c: string) =>
  sql`COALESCE(substring(${sql.raw(c)} from '[0-9]+ ?mm'), '(no size)')`;
// Silver === Natural (silver); titanium-natural is also silver-coloured but we
// split material separately, so colour folds them into one "Silver" bucket.
const colour = (c: string) => sql`
  CASE WHEN ${sql.raw(c)} ILIKE '%rose gold%' THEN 'Rose Gold'
       WHEN ${sql.raw(c)} ILIKE '%yellow gold%' OR ${sql.raw(c)} ILIKE '%/ gold%' THEN 'Yellow Gold'
       WHEN ${sql.raw(c)} ILIKE '%black%' THEN 'Black'
       ELSE 'Silver (incl. natural)' END`;
const material = (c: string) =>
  sql`CASE WHEN ${sql.raw(c)} ILIKE '%titanium%' THEN 'Titanium' ELSE 'Stainless' END`;
const texture = (c: string) =>
  sql`CASE WHEN ${sql.raw(c)} ILIKE '%bead blasted%' THEN 'Bead Blasted' ELSE 'Polished' END`;
const model = (c: string) => sql`
  CASE WHEN ${sql.raw(c)} ILIKE '%M4%' THEN 'M4 Link'
       WHEN ${sql.raw(c)} ILIKE '%tang%' THEN 'Tang (accessory)'
       WHEN ${sql.raw(c)} ILIKE '%M1%' OR ${sql.raw(c)} ILIKE '%model one%' THEN 'M1 Buckle'
       ELSE 'Other' END`;

async function q(label: string, query: any) {
  console.log(`\n===== ${label} =====`);
  try {
    const res = await db.execute(query);
    console.table((res as any).rows ?? res);
  } catch (e: any) {
    console.log(`  (skipped: ${e.message})`);
  }
}

// Generic unit-level return rate by a normalized key derived from a variant/
// title column. soldCol on order_line_item, retCol on order_refund_line.
function unitRate(keyOf: (c: string) => any, soldCol: string, retCol: string, minSold = 25) {
  return sql`
    WITH sold AS (
      SELECT ${keyOf(soldCol)} AS k, SUM(oli.quantity) AS units_sold
      FROM order_line_item oli JOIN "order" o ON o.id=oli.order_id
      WHERE ${D2C} GROUP BY 1
    ), ret AS (
      SELECT ${keyOf(retCol)} AS k, SUM(rl.quantity) AS units_returned
      FROM order_refund_line rl JOIN "order" o ON o.id=rl.order_id
      WHERE ${D2C} GROUP BY 1
    )
    SELECT sold.k AS segment, sold.units_sold,
      COALESCE(ret.units_returned,0) AS units_returned,
      ROUND(100.0*COALESCE(ret.units_returned,0)/NULLIF(sold.units_sold,0),1) AS unit_return_rate_pct
    FROM sold LEFT JOIN ret ON ret.k=sold.k
    WHERE sold.units_sold >= ${minSold}
    ORDER BY unit_return_rate_pct DESC`;
}

async function main() {
  // ── 0. baseline ──
  await q("0. BASELINE — D2C order-level vs unit-level", sql`
    WITH ob AS (
      SELECT o.id, o.total_price, o.total_refunded,
        (SELECT COALESCE(SUM(quantity),0) FROM order_line_item WHERE order_id=o.id) AS units,
        (SELECT COALESCE(SUM(quantity),0) FROM order_refund_line WHERE order_id=o.id) AS ru
      FROM "order" o WHERE ${D2C}
    )
    SELECT COUNT(*) AS orders,
      COUNT(*) FILTER (WHERE total_refunded>0) AS returned_orders,
      ROUND(100.0*COUNT(*) FILTER (WHERE total_refunded>0)/NULLIF(COUNT(*),0),1) AS order_return_rate_pct,
      SUM(units) AS units_sold, SUM(ru) AS units_returned,
      ROUND(100.0*SUM(ru)/NULLIF(SUM(units),0),1) AS unit_return_rate_pct,
      ROUND(AVG(total_price)/100.0,2) AS aov_usd,
      ROUND(100.0*SUM(total_refunded)/NULLIF(SUM(total_price),0),1) AS refund_pct_of_gmv
    FROM ob`);

  // ── PRODUCT ATTRIBUTES (exact unit-level) ──
  await q("1. WIDTH / SIZE — unit return rate (the fit signal)",
    unitRate(width, "oli.variant_title", "rl.variant_title"));
  await q("2. COLOUR / FINISH — unit return rate (silver+natural merged)",
    unitRate(colour, "oli.variant_title", "rl.variant_title"));
  await q("3. MATERIAL — stainless vs titanium, unit return rate",
    unitRate(material, "oli.variant_title", "rl.variant_title"));
  await q("4. TEXTURE — bead blasted vs polished, unit return rate",
    unitRate(texture, "oli.variant_title", "rl.variant_title"));
  await q("5. MODEL — M1 vs M4 vs accessory, unit return rate",
    unitRate(model, "oli.title", "rl.title"));
  await q("6. WIDTH × COLOUR — unit return rate, top by volume",
    unitRate((c) => sql`${width(c)} || ' / ' || ${colour(c)}`, "oli.variant_title", "rl.variant_title", 25));

  // ── ORDER SHAPE (order-level + unit-level) ──
  await q("7. BASKET VARIETY — # distinct products: order-level + unit-level", sql`
    WITH ob AS (
      SELECT o.id, COUNT(oli.id) AS lines, SUM(oli.quantity) AS units,
        o.total_refunded
      FROM "order" o JOIN order_line_item oli ON oli.order_id=o.id
      WHERE ${D2C} GROUP BY o.id, o.total_refunded
    ), rb AS (
      SELECT order_id, SUM(quantity) AS ru FROM order_refund_line GROUP BY order_id
    )
    SELECT CASE WHEN lines<=1 THEN '1 product' WHEN lines=2 THEN '2 products'
                WHEN lines=3 THEN '3 products' ELSE '4+ products' END AS variety,
      COUNT(*) AS orders,
      ROUND(100.0*COUNT(*) FILTER (WHERE ob.total_refunded>0)/NULLIF(COUNT(*),0),1) AS order_return_pct,
      SUM(units) AS units_sold, SUM(COALESCE(ru,0)) AS units_returned,
      ROUND(100.0*SUM(COALESCE(ru,0))/NULLIF(SUM(units),0),1) AS unit_return_pct
    FROM ob LEFT JOIN rb ON rb.order_id=ob.id GROUP BY 1 ORDER BY 1`);

  await q("8. UNIT COUNT — units in order: order-level + unit-level", sql`
    WITH ob AS (
      SELECT o.id, SUM(oli.quantity) AS units, o.total_refunded
      FROM "order" o JOIN order_line_item oli ON oli.order_id=o.id
      WHERE ${D2C} GROUP BY o.id, o.total_refunded
    ), rb AS (
      SELECT order_id, SUM(quantity) AS ru FROM order_refund_line GROUP BY order_id
    )
    SELECT CASE WHEN units<=1 THEN '1 unit' WHEN units=2 THEN '2 units'
                WHEN units=3 THEN '3 units' WHEN units BETWEEN 4 AND 5 THEN '4-5 units'
                ELSE '6+ units' END AS band,
      COUNT(*) AS orders,
      ROUND(100.0*COUNT(*) FILTER (WHERE ob.total_refunded>0)/NULLIF(COUNT(*),0),1) AS order_return_pct,
      SUM(units) AS units_sold, SUM(COALESCE(ru,0)) AS units_returned,
      ROUND(100.0*SUM(COALESCE(ru,0))/NULLIF(SUM(units),0),1) AS unit_return_pct
    FROM ob LEFT JOIN rb ON rb.order_id=ob.id GROUP BY 1 ORDER BY 1`);

  await q("9. ORDER VALUE — AOV band: order-level + unit-level", sql`
    WITH ob AS (
      SELECT o.id, o.total_price, o.total_refunded,
        (SELECT COALESCE(SUM(quantity),0) FROM order_line_item WHERE order_id=o.id) AS units,
        (SELECT COALESCE(SUM(quantity),0) FROM order_refund_line WHERE order_id=o.id) AS ru
      FROM "order" o WHERE ${D2C}
    )
    SELECT CASE WHEN total_price<3000 THEN 'a. <$30' WHEN total_price<6000 THEN 'b. $30-60'
                WHEN total_price<9000 THEN 'c. $60-90' WHEN total_price<15000 THEN 'd. $90-150'
                ELSE 'e. $150+' END AS aov_band,
      COUNT(*) AS orders,
      ROUND(100.0*COUNT(*) FILTER (WHERE total_refunded>0)/NULLIF(COUNT(*),0),1) AS order_return_pct,
      SUM(units) AS units_sold, SUM(ru) AS units_returned,
      ROUND(100.0*SUM(ru)/NULLIF(SUM(units),0),1) AS unit_return_pct
    FROM ob GROUP BY 1 ORDER BY 1`);

  // ── CUSTOMER / ACQUISITION (order-level) ──
  await q("10. CUSTOMER HISTORY — new vs repeat", sql`
    WITH ranked AS (
      SELECT o.id, o.total_refunded,
        ROW_NUMBER() OVER (PARTITION BY COALESCE(o.customer_id,'guest:'||o.shopify_id) ORDER BY o.processed_at) AS nth
      FROM "order" o WHERE ${D2C}
    )
    SELECT CASE WHEN nth=1 THEN '1st (new)' WHEN nth=2 THEN '2nd' ELSE '3rd+' END AS stage,
      COUNT(*) AS orders, COUNT(*) FILTER (WHERE total_refunded>0) AS returned,
      ROUND(100.0*COUNT(*) FILTER (WHERE total_refunded>0)/NULLIF(COUNT(*),0),1) AS order_return_pct
    FROM ranked GROUP BY 1 ORDER BY 1`);

  await q("11. DISCOUNT — discounted vs full price", sql`
    SELECT CASE WHEN o.total_discounts>0 OR EXISTS(SELECT 1 FROM order_discount_code d WHERE d.order_id=o.id)
                THEN 'discounted' ELSE 'full price' END AS pricing,
      COUNT(*) AS orders, COUNT(*) FILTER (WHERE o.total_refunded>0) AS returned,
      ROUND(100.0*COUNT(*) FILTER (WHERE o.total_refunded>0)/NULLIF(COUNT(*),0),1) AS order_return_pct
    FROM "order" o WHERE ${D2C} GROUP BY 1 ORDER BY 1`);

  await q("12. UTM SOURCE — acquisition channel", sql`
    SELECT COALESCE(c.utm_source,'(none)') AS utm_source,
      COUNT(*) AS orders, COUNT(*) FILTER (WHERE o.total_refunded>0) AS returned,
      ROUND(100.0*COUNT(*) FILTER (WHERE o.total_refunded>0)/NULLIF(COUNT(*),0),1) AS order_return_pct
    FROM "order" o JOIN customer c ON c.id=o.customer_id
    WHERE ${D2C} GROUP BY 1 HAVING COUNT(*)>=20 ORDER BY order_return_pct DESC`);

  await q("13. GEOGRAPHY — customer default country (>=20 orders)", sql`
    WITH addr AS (SELECT DISTINCT ON (customer_id) customer_id, country_code FROM customer_address WHERE is_default)
    SELECT COALESCE(a.country_code,'(unknown)') AS country,
      COUNT(*) AS orders, COUNT(*) FILTER (WHERE o.total_refunded>0) AS returned,
      ROUND(100.0*COUNT(*) FILTER (WHERE o.total_refunded>0)/NULLIF(COUNT(*),0),1) AS order_return_pct
    FROM "order" o LEFT JOIN addr a ON a.customer_id=o.customer_id
    WHERE ${D2C} GROUP BY 1 HAVING COUNT(*)>=20 ORDER BY orders DESC LIMIT 12`);

  // ── RETURN BEHAVIOUR ──
  await q("14. REFUND DEPTH — how much of a returned order comes back, by basket size", sql`
    WITH o2 AS (
      SELECT o.id, COUNT(oli.id) AS lines,
        ROUND(100.0*o.total_refunded/NULLIF(o.total_price,0),0) AS refund_share
      FROM "order" o JOIN order_line_item oli ON oli.order_id=o.id
      WHERE ${D2C} AND o.total_refunded>0 GROUP BY o.id, o.total_price, o.total_refunded
    )
    SELECT CASE WHEN lines<=1 THEN '1 product' WHEN lines=2 THEN '2 products' ELSE '3+ products' END AS variety,
      COUNT(*) AS returned_orders,
      COUNT(*) FILTER (WHERE refund_share>=95) AS full_refunds,
      COUNT(*) FILTER (WHERE refund_share<95) AS partial_refunds,
      ROUND(AVG(refund_share),0) AS avg_pct_refunded
    FROM o2 GROUP BY 1 ORDER BY 1`);

  await q("15. LATENCY — days from order to actual refund (exact refunded_at)", sql`
    WITH lat AS (
      SELECT o.id, EXTRACT(DAY FROM (MIN(rl.refunded_at) - o.processed_at)) AS days
      FROM order_refund_line rl JOIN "order" o ON o.id=rl.order_id
      WHERE ${D2C} AND rl.refunded_at IS NOT NULL GROUP BY o.id, o.processed_at
    )
    SELECT CASE WHEN days<=7 THEN 'a. <=7d' WHEN days<=14 THEN 'b. 8-14d'
                WHEN days<=30 THEN 'c. 15-30d' WHEN days<=60 THEN 'd. 31-60d' ELSE 'e. 60d+' END AS bucket,
      COUNT(*) AS returns, ROUND(AVG(days),0) AS avg_days
    FROM lat GROUP BY 1 ORDER BY 1`);

  await q("16. SEASON — order-level return rate by order month", sql`
    SELECT TO_CHAR(date_trunc('month',o.processed_at),'YYYY-MM') AS month,
      COUNT(*) AS orders, COUNT(*) FILTER (WHERE o.total_refunded>0) AS returned,
      ROUND(100.0*COUNT(*) FILTER (WHERE o.total_refunded>0)/NULLIF(COUNT(*),0),1) AS order_return_pct
    FROM "order" o WHERE ${D2C} AND o.processed_at >= '2025-01-01' GROUP BY 1 ORDER BY 1`);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
