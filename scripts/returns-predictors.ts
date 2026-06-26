import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * One-off analysis: what predicts that an order will be (partially or fully) returned?
 *
 * A "return" here = an order with total_refunded > 0.
 *
 * Population = DIRECT-TO-CONSUMER orders only. We exclude:
 *   - cancelled orders and $0 sample orders (is_sample)
 *   - POS orders            (source_name = 'pos')            — bought in person
 *   - B2B / wholesale:      (source_name = 'shopify_draft_order')  — manual draft path
 *                           OR customer linked to a company (customer.company_id)
 * We compare returned vs. non-returned orders across every dimension we have.
 */

// Shared D2C filter. Every query aliases the order table as `o`.
const D2C = sql`
  o.is_sample = false
  AND o.cancelled_at IS NULL
  AND o.processed_at IS NOT NULL
  AND COALESCE(o.source_name,'') NOT IN ('pos','shopify_draft_order')
  AND o.customer_id NOT IN (SELECT id FROM customer WHERE company_id IS NOT NULL)
`;

async function q(label: string, query: any) {
  console.log(`\n===== ${label} =====`);
  try {
    const res = await db.execute(query);
    console.table((res as any).rows ?? res);
  } catch (e: any) {
    console.log(`  (skipped: ${e.message})`);
  }
}

async function main() {
  // ---- diagnostic: what are we excluding ----
  await q(
    "X. EXCLUSIONS — orders removed by each filter (overlap possible)",
    sql`
      SELECT
        COUNT(*) FILTER (WHERE is_sample) AS sample_orders,
        COUNT(*) FILTER (WHERE cancelled_at IS NOT NULL) AS cancelled,
        COUNT(*) FILTER (WHERE source_name = 'pos') AS pos_orders,
        COUNT(*) FILTER (WHERE source_name = 'shopify_draft_order') AS draft_orders,
        COUNT(*) FILTER (WHERE customer_id IN (SELECT id FROM customer WHERE company_id IS NOT NULL)) AS company_linked,
        COUNT(*) AS all_orders
      FROM "order"
    `,
  );

  // ---- 0. Baseline ----
  await q(
    "0. BASELINE — D2C only (no POS, no B2B, no samples)",
    sql`
      SELECT
        COUNT(*) AS orders,
        COUNT(*) FILTER (WHERE o.total_refunded > 0) AS returned_orders,
        ROUND(100.0 * COUNT(*) FILTER (WHERE o.total_refunded > 0) / NULLIF(COUNT(*),0), 1) AS return_rate_pct,
        ROUND(AVG(o.total_price)/100.0, 2) AS avg_order_value_usd,
        SUM(o.total_refunded) AS total_refunded_cents,
        ROUND(100.0 * SUM(o.total_refunded) / NULLIF(SUM(o.total_price),0), 1) AS refund_pct_of_gmv
      FROM "order" o
      WHERE ${D2C}
    `,
  );

  // ---- 1. Order value bands ----
  await q(
    "1. ORDER VALUE — return rate by AOV band",
    sql`
      SELECT
        CASE
          WHEN o.total_price < 3000  THEN 'a. < $30'
          WHEN o.total_price < 6000  THEN 'b. $30–60'
          WHEN o.total_price < 9000  THEN 'c. $60–90'
          WHEN o.total_price < 15000 THEN 'd. $90–150'
          ELSE                            'e. $150+'
        END AS aov_band,
        COUNT(*) AS orders,
        COUNT(*) FILTER (WHERE o.total_refunded > 0) AS returned,
        ROUND(100.0 * COUNT(*) FILTER (WHERE o.total_refunded > 0)/NULLIF(COUNT(*),0),1) AS return_rate_pct
      FROM "order" o
      WHERE ${D2C}
      GROUP BY 1 ORDER BY 1
    `,
  );

  // ---- 2. Item count ----
  await q(
    "2. ITEM COUNT — return rate by total units in the order",
    sql`
      WITH li AS (
        SELECT o.id, o.total_refunded, COALESCE(SUM(oli.quantity),0) AS units
        FROM "order" o
        LEFT JOIN order_line_item oli ON oli.order_id = o.id
        WHERE ${D2C}
        GROUP BY o.id, o.total_refunded
      )
      SELECT
        CASE
          WHEN units <= 1 THEN '1 unit'
          WHEN units = 2  THEN '2 units'
          WHEN units = 3  THEN '3 units'
          WHEN units BETWEEN 4 AND 5 THEN '4–5 units'
          ELSE '6+ units'
        END AS unit_band,
        COUNT(*) AS orders,
        COUNT(*) FILTER (WHERE total_refunded > 0) AS returned,
        ROUND(100.0 * COUNT(*) FILTER (WHERE total_refunded>0)/NULLIF(COUNT(*),0),1) AS return_rate_pct
      FROM li GROUP BY 1 ORDER BY 1
    `,
  );

  await q(
    "2b. DISTINCT LINES — return rate by number of distinct products (variety)",
    sql`
      WITH li AS (
        SELECT o.id, o.total_refunded, COUNT(oli.id) AS distinct_lines
        FROM "order" o
        LEFT JOIN order_line_item oli ON oli.order_id = o.id
        WHERE ${D2C}
        GROUP BY o.id, o.total_refunded
      )
      SELECT
        CASE WHEN distinct_lines <= 1 THEN '1 product'
             WHEN distinct_lines = 2 THEN '2 products'
             WHEN distinct_lines = 3 THEN '3 products'
             ELSE '4+ products' END AS variety,
        COUNT(*) AS orders,
        COUNT(*) FILTER (WHERE total_refunded>0) AS returned,
        ROUND(100.0*COUNT(*) FILTER (WHERE total_refunded>0)/NULLIF(COUNT(*),0),1) AS return_rate_pct
      FROM li GROUP BY 1 ORDER BY 1
    `,
  );

  // ---- 3. Customer history (new vs repeat) ----
  await q(
    "3. CUSTOMER HISTORY — new vs repeat buyer at time of order",
    sql`
      WITH ranked AS (
        SELECT o.id, o.total_refunded,
          ROW_NUMBER() OVER (PARTITION BY COALESCE(o.customer_id,'guest:'||o.shopify_id) ORDER BY o.processed_at) AS nth_order
        FROM "order" o
        WHERE ${D2C}
      )
      SELECT
        CASE WHEN nth_order=1 THEN '1st order (new)'
             WHEN nth_order=2 THEN '2nd order'
             ELSE '3rd+ order' END AS buyer_stage,
        COUNT(*) AS orders,
        COUNT(*) FILTER (WHERE total_refunded>0) AS returned,
        ROUND(100.0*COUNT(*) FILTER (WHERE total_refunded>0)/NULLIF(COUNT(*),0),1) AS return_rate_pct
      FROM ranked GROUP BY 1 ORDER BY 1
    `,
  );

  // ---- 4. Discount usage ----
  await q(
    "4. DISCOUNT — orders with a discount vs full price",
    sql`
      WITH base AS (
        SELECT o.id, o.total_refunded, o.total_discounts,
               EXISTS(SELECT 1 FROM order_discount_code d WHERE d.order_id=o.id) AS has_code
        FROM "order" o
        WHERE ${D2C}
      )
      SELECT
        CASE WHEN has_code OR total_discounts>0 THEN 'discounted' ELSE 'full price' END AS pricing,
        COUNT(*) AS orders,
        COUNT(*) FILTER (WHERE total_refunded>0) AS returned,
        ROUND(100.0*COUNT(*) FILTER (WHERE total_refunded>0)/NULLIF(COUNT(*),0),1) AS return_rate_pct
      FROM base GROUP BY 1 ORDER BY 1
    `,
  );

  // ---- 5. Channel / source ----
  await q(
    "5. CHANNEL — return rate by source_name (D2C; POS & draft already excluded)",
    sql`
      SELECT
        COALESCE(o.source_name,'(unknown)') AS source,
        COUNT(*) AS orders,
        COUNT(*) FILTER (WHERE o.total_refunded>0) AS returned,
        ROUND(100.0*COUNT(*) FILTER (WHERE o.total_refunded>0)/NULLIF(COUNT(*),0),1) AS return_rate_pct
      FROM "order" o
      WHERE ${D2C}
      GROUP BY 1 HAVING COUNT(*) >= 20 ORDER BY return_rate_pct DESC
    `,
  );

  await q(
    "5b. UTM SOURCE — return rate by acquisition utm_source (from customer)",
    sql`
      SELECT
        COALESCE(c.utm_source,'(none)') AS utm_source,
        COUNT(*) AS orders,
        COUNT(*) FILTER (WHERE o.total_refunded>0) AS returned,
        ROUND(100.0*COUNT(*) FILTER (WHERE o.total_refunded>0)/NULLIF(COUNT(*),0),1) AS return_rate_pct
      FROM "order" o JOIN customer c ON c.id=o.customer_id
      WHERE ${D2C}
      GROUP BY 1 HAVING COUNT(*) >= 20 ORDER BY return_rate_pct DESC
    `,
  );

  // ---- 7. Product-level ----
  await q(
    "7. PRODUCT — return rate by product title (line-item level, top by volume)",
    sql`
      SELECT
        COALESCE(oli.title,'(none)') AS product,
        COUNT(DISTINCT o.id) AS orders_with_item,
        COUNT(DISTINCT o.id) FILTER (WHERE o.total_refunded>0) AS in_returned_orders,
        ROUND(100.0*COUNT(DISTINCT o.id) FILTER (WHERE o.total_refunded>0)/NULLIF(COUNT(DISTINCT o.id),0),1) AS return_rate_pct
      FROM order_line_item oli
      JOIN "order" o ON o.id=oli.order_id
      WHERE ${D2C}
      GROUP BY 1 HAVING COUNT(DISTINCT o.id) >= 25 ORDER BY return_rate_pct DESC LIMIT 25
    `,
  );

  // ---- 8. Variant (size/finish) ----
  await q(
    "8. VARIANT — return rate by variant_title (size/finish), top by volume",
    sql`
      SELECT
        COALESCE(oli.variant_title,'(none)') AS variant,
        COUNT(DISTINCT o.id) AS orders_with_variant,
        COUNT(DISTINCT o.id) FILTER (WHERE o.total_refunded>0) AS in_returned_orders,
        ROUND(100.0*COUNT(DISTINCT o.id) FILTER (WHERE o.total_refunded>0)/NULLIF(COUNT(DISTINCT o.id),0),1) AS return_rate_pct
      FROM order_line_item oli
      JOIN "order" o ON o.id=oli.order_id
      WHERE ${D2C}
      GROUP BY 1 HAVING COUNT(DISTINCT o.id) >= 25 ORDER BY return_rate_pct DESC LIMIT 25
    `,
  );

  // ---- 8b. Finish family (rolled up across widths) ----
  await q(
    "8b. FINISH FAMILY — return rate by finish, rolled up across sizes",
    sql`
      WITH tagged AS (
        SELECT DISTINCT o.id, o.total_refunded,
          CASE
            WHEN oli.variant_title ILIKE '%rose gold%' OR oli.title ILIKE '%rose gold%' THEN 'Rose Gold'
            WHEN oli.variant_title ILIKE '%yellow gold%' OR oli.title ILIKE '%yellow gold%' OR oli.variant_title ILIKE '%/ gold%' THEN 'Yellow Gold'
            WHEN oli.variant_title ILIKE '%black%' OR oli.title ILIKE '%black%' THEN 'Black'
            WHEN oli.variant_title ILIKE '%bead blasted%' OR oli.title ILIKE '%bead blasted%' THEN 'Bead Blasted'
            WHEN oli.variant_title ILIKE '%titanium%' OR oli.title ILIKE '%titanium%' THEN 'Titanium (natural)'
            WHEN oli.variant_title ILIKE '%natural%' OR oli.variant_title ILIKE '%silver%' OR oli.variant_title ILIKE '%stainless%' THEN 'Stainless (silver)'
            ELSE 'Other/Unknown'
          END AS finish
        FROM order_line_item oli
        JOIN "order" o ON o.id=oli.order_id
        WHERE ${D2C}
      )
      SELECT finish,
        COUNT(*) AS orders_with_finish,
        COUNT(*) FILTER (WHERE total_refunded>0) AS in_returned_orders,
        ROUND(100.0*COUNT(*) FILTER (WHERE total_refunded>0)/NULLIF(COUNT(*),0),1) AS return_rate_pct
      FROM tagged GROUP BY 1 ORDER BY return_rate_pct DESC
    `,
  );

  // ---- 9. Refund shape ----
  await q(
    "9. REFUND SHAPE — full vs partial returns among returned D2C orders",
    sql`
      WITH r AS (
        SELECT o.total_price, o.total_refunded,
          ROUND(100.0*o.total_refunded/NULLIF(o.total_price,0),0) AS refund_share
        FROM "order" o
        WHERE ${D2C} AND o.total_refunded>0
      )
      SELECT
        CASE WHEN refund_share >= 95 THEN 'full (>=95%)'
             WHEN refund_share >= 50 THEN 'majority (50–95%)'
             ELSE 'partial (<50%)' END AS refund_kind,
        COUNT(*) AS returned_orders,
        ROUND(AVG(total_price)/100.0,2) AS avg_order_usd
      FROM r GROUP BY 1 ORDER BY 1
    `,
  );

  // ---- 11. Seasonality ----
  await q(
    "11. SEASON — D2C return rate by order month",
    sql`
      SELECT
        TO_CHAR(date_trunc('month', o.processed_at),'YYYY-MM') AS month,
        COUNT(*) AS orders,
        COUNT(*) FILTER (WHERE o.total_refunded>0) AS returned,
        ROUND(100.0*COUNT(*) FILTER (WHERE o.total_refunded>0)/NULLIF(COUNT(*),0),1) AS return_rate_pct
      FROM "order" o
      WHERE ${D2C}
      GROUP BY 1 ORDER BY 1
    `,
  );

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
