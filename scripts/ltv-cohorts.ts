import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * Cohort LTV computed from the `order` table directly (source of truth).
 * Customers are identified by `customer_id` when present, otherwise by
 * shopify_id of the order (guest checkouts become single-order "cohorts of one").
 * The customer.total_spent / first_order_at fields are known-stale and not used.
 */
const WINDOW_DAYS = 180;

type CohortRow = {
  cohort_month: string;
  buyers: number;
  window_complete: boolean;
  total_180d_cents: string;
  avg_ltv_180d_cents: string;
  repeat_buyers: number;
  repeat_rate_pct: string;
  orders_180d: number;
  orders_per_buyer_180d: string;
};

async function main() {
  const result = await db.execute(sql`
    WITH buyer_orders AS (
      SELECT
        -- Identify the "buyer": prefer customer_id, fall back to the order's own shopify_id
        -- (guest checkouts become a single-order cohort-of-one)
        COALESCE(o.customer_id, 'guest:' || o.shopify_id) AS buyer_key,
        o.processed_at,
        o.total_price
      FROM "order" o
      WHERE o.processed_at IS NOT NULL
    ),
    first_order AS (
      SELECT
        buyer_key,
        MIN(processed_at) AS first_at
      FROM buyer_orders
      GROUP BY buyer_key
    ),
    window_spend AS (
      SELECT
        fo.buyer_key,
        date_trunc('month', fo.first_at)::date AS cohort_month,
        SUM(bo.total_price) AS spend_180d,
        COUNT(*) AS orders_180d
      FROM first_order fo
      JOIN buyer_orders bo
        ON bo.buyer_key = fo.buyer_key
       AND bo.processed_at >= fo.first_at
       AND bo.processed_at <  fo.first_at + (${WINDOW_DAYS} || ' days')::interval
      GROUP BY fo.buyer_key, cohort_month
    )
    SELECT
      to_char(cohort_month, 'YYYY-MM') AS cohort_month,
      COUNT(*)::int AS buyers,
      (cohort_month + (${WINDOW_DAYS} || ' days')::interval) <= now() AS window_complete,
      SUM(spend_180d)::bigint AS total_180d_cents,
      ROUND(AVG(spend_180d))::bigint AS avg_ltv_180d_cents,
      SUM(CASE WHEN orders_180d > 1 THEN 1 ELSE 0 END)::int AS repeat_buyers,
      ROUND(100.0 * SUM(CASE WHEN orders_180d > 1 THEN 1 ELSE 0 END) / COUNT(*), 1)::text AS repeat_rate_pct,
      SUM(orders_180d)::int AS orders_180d,
      ROUND(AVG(orders_180d), 2)::text AS orders_per_buyer_180d
    FROM window_spend
    GROUP BY cohort_month
    ORDER BY cohort_month;
  `);

  const rows: CohortRow[] =
    (result as unknown as { rows?: CohortRow[] }).rows ??
    (result as unknown as CohortRow[]);

  const dollars = (cents: number | string | bigint) =>
    `$${(Number(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  console.log(`\n${WINDOW_DAYS}-day LTV by acquisition cohort (built from order table)\n`);
  console.log(
    [
      "cohort".padEnd(8),
      "buyers".padStart(7),
      "complete".padStart(9),
      "avg LTV".padStart(11),
      "total".padStart(13),
      "repeat%".padStart(8),
      "ord/buyer".padStart(10),
    ].join("  "),
  );
  console.log("-".repeat(75));

  let totalBuyers = 0;
  let totalSpend = BigInt(0);
  for (const r of rows) {
    totalBuyers += Number(r.buyers);
    totalSpend += BigInt(r.total_180d_cents);
    console.log(
      [
        String(r.cohort_month).padEnd(8),
        String(r.buyers).padStart(7),
        String(r.window_complete ? "yes" : "partial").padStart(9),
        dollars(r.avg_ltv_180d_cents).padStart(11),
        dollars(r.total_180d_cents).padStart(13),
        `${r.repeat_rate_pct}%`.padStart(8),
        String(r.orders_per_buyer_180d).padStart(10),
      ].join("  "),
    );
  }
  console.log("-".repeat(75));
  console.log(`\nTotal buyers across cohorts:  ${totalBuyers}`);
  console.log(`Aggregate 180-day revenue:    ${dollars(totalSpend.toString())}`);
  console.log(
    `\nNote: 'partial' cohorts have not yet reached their full ${WINDOW_DAYS}-day window — their LTV will grow.`,
  );
  console.log(
    `Note: guest orders (null customer_id) are treated as cohort-of-one buyers, so repeat rates are mildly conservative.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
