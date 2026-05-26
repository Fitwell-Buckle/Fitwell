import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  const dollars = (cents: number | string | bigint) =>
    `$${(Number(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const rowsOf = <T>(r: unknown): T[] =>
    (r as { rows?: T[] }).rows ?? (r as T[]);

  // 1. Overall counts
  const counts = rowsOf<{ customers: number; orders: number; line_items: number }>(
    await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM customer)::int AS customers,
        (SELECT COUNT(*) FROM "order")::int AS orders,
        (SELECT COUNT(*) FROM order_line_item)::int AS line_items
    `),
  )[0];
  console.log("\n== ROW COUNTS ==");
  console.log(`customer:        ${counts.customers}`);
  console.log(`order:           ${counts.orders}`);
  console.log(`order_line_item: ${counts.line_items}`);

  // 2. Customer-side rollup vs order-table rollup
  const totals = rowsOf<{
    customer_total_spent: string;
    customer_order_count: string;
    order_total_price_sum: string;
    order_rows: string;
    orders_with_null_processed_at: string;
    orders_with_null_customer_id: string;
  }>(
    await db.execute(sql`
      SELECT
        (SELECT COALESCE(SUM(total_spent),0) FROM customer)::bigint AS customer_total_spent,
        (SELECT COALESCE(SUM(order_count),0) FROM customer)::bigint AS customer_order_count,
        (SELECT COALESCE(SUM(total_price),0) FROM "order")::bigint AS order_total_price_sum,
        (SELECT COUNT(*) FROM "order")::bigint AS order_rows,
        (SELECT COUNT(*) FROM "order" WHERE processed_at IS NULL)::bigint AS orders_with_null_processed_at,
        (SELECT COUNT(*) FROM "order" WHERE customer_id IS NULL)::bigint AS orders_with_null_customer_id
    `),
  )[0];
  console.log("\n== ROLLUP COMPARISON ==");
  console.log(`SUM(customer.total_spent):    ${dollars(totals.customer_total_spent)}`);
  console.log(`SUM(customer.order_count):    ${totals.customer_order_count}`);
  console.log(`SUM(order.total_price):       ${dollars(totals.order_total_price_sum)}`);
  console.log(`order rows:                   ${totals.order_rows}`);
  console.log(`orders w/ NULL processed_at:  ${totals.orders_with_null_processed_at}`);
  console.log(`orders w/ NULL customer_id:   ${totals.orders_with_null_customer_id}`);

  // 3. Order date range
  const dates = rowsOf<{
    earliest_order: string | null;
    latest_order: string | null;
    earliest_customer: string | null;
    latest_customer: string | null;
  }>(
    await db.execute(sql`
      SELECT
        (SELECT MIN(processed_at) FROM "order") AS earliest_order,
        (SELECT MAX(processed_at) FROM "order") AS latest_order,
        (SELECT MIN(first_order_at) FROM customer) AS earliest_customer,
        (SELECT MAX(first_order_at) FROM customer) AS latest_customer
    `),
  )[0];
  console.log("\n== DATE RANGES ==");
  console.log(`order.processed_at:      ${dates.earliest_order} → ${dates.latest_order}`);
  console.log(`customer.first_order_at: ${dates.earliest_customer} → ${dates.latest_customer}`);

  // 4. Last 180 days revenue (multiple lenses)
  const last180 = rowsOf<{
    orders_last_180d: string;
    revenue_last_180d_from_orders: string;
    customers_with_first_order_last_180d: string;
    customer_spent_last_180d_acquisition: string;
  }>(
    await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM "order" WHERE processed_at >= now() - interval '180 days')::bigint AS orders_last_180d,
        (SELECT COALESCE(SUM(total_price),0) FROM "order" WHERE processed_at >= now() - interval '180 days')::bigint AS revenue_last_180d_from_orders,
        (SELECT COUNT(*) FROM customer WHERE first_order_at >= now() - interval '180 days')::bigint AS customers_with_first_order_last_180d,
        (SELECT COALESCE(SUM(total_spent),0) FROM customer WHERE first_order_at >= now() - interval '180 days')::bigint AS customer_spent_last_180d_acquisition
    `),
  )[0];
  console.log("\n== LAST 180 DAYS (rolling window from today) ==");
  console.log(`orders placed in last 180d:                    ${last180.orders_last_180d}`);
  console.log(`SUM(order.total_price) last 180d:              ${dollars(last180.revenue_last_180d_from_orders)}`);
  console.log(`customers acquired in last 180d:               ${last180.customers_with_first_order_last_180d}`);
  console.log(`SUM(total_spent) for those customers (all-time): ${dollars(last180.customer_spent_last_180d_acquisition)}`);

  // 5. Spot check: customers with totalSpent but zero matching orders
  const mismatched = rowsOf<{
    customers_with_spent_no_orders: string;
    spent_unmatched: string;
  }>(
    await db.execute(sql`
      SELECT
        COUNT(*)::bigint AS customers_with_spent_no_orders,
        COALESCE(SUM(c.total_spent),0)::bigint AS spent_unmatched
      FROM customer c
      LEFT JOIN "order" o ON o.customer_id = c.id
      WHERE c.total_spent > 0
      GROUP BY ()
      HAVING COUNT(o.id) FILTER (WHERE o.id IS NOT NULL) = 0 OR COUNT(*) > 0
    `),
  );
  if (mismatched.length > 0) {
    // Better query: customers whose totalSpent > 0 but have zero orders in order table
    const orphans = rowsOf<{
      customer_orphans: string;
      orphan_spent: string;
    }>(
      await db.execute(sql`
        SELECT
          COUNT(*)::bigint AS customer_orphans,
          COALESCE(SUM(total_spent),0)::bigint AS orphan_spent
        FROM customer c
        WHERE total_spent > 0
          AND NOT EXISTS (SELECT 1 FROM "order" o WHERE o.customer_id = c.id)
      `),
    )[0];
    console.log("\n== CUSTOMER ↔ ORDER MISMATCH ==");
    console.log(`customers with total_spent > 0 but ZERO orders in 'order' table: ${orphans.customer_orphans}`);
    console.log(`unmatched spend trapped on customer.total_spent:                  ${dollars(orphans.orphan_spent)}`);
  }

  // 6. Distribution of orders by month (sanity check)
  const monthly = rowsOf<{ month: string; orders: string; revenue: string }>(
    await db.execute(sql`
      SELECT
        to_char(date_trunc('month', processed_at), 'YYYY-MM') AS month,
        COUNT(*)::bigint AS orders,
        SUM(total_price)::bigint AS revenue
      FROM "order"
      WHERE processed_at IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `),
  );
  console.log("\n== ORDERS BY MONTH ==");
  for (const m of monthly) {
    console.log(`  ${m.month}: ${m.orders.toString().padStart(4)} orders  ${dollars(m.revenue).padStart(13)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
