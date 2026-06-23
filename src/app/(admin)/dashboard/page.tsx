import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { order, orderLineItem, customer } from "@/lib/schema";
import { sql, eq, desc, count, gte, lte, lt, and } from "drizzle-orm";
import { parseDateRange } from "@/lib/date-range";
import { getDashboardSettings } from "@/lib/dashboard/settings";
import { STORE_TZ } from "@/lib/timezone";
import {
  formatBucketLabel,
  dateToBucketKey,
  generateBucketKeys,
} from "@/lib/chart-utils";
import {
  REPEAT_WINDOWS,
  computeRepeatWindows,
  type RepeatTiming,
} from "@/lib/analytics/repeat-windows";
import { MetricCard } from "@/components/charts/metric-card";
import { CustomerValueChart } from "@/components/charts/customer-value-chart";
import { DashboardViewToggle } from "./view-toggle";
import { SegmentToggle } from "./segment-toggle";
import { CustomerToggle } from "./customer-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mono, Muted } from "@/components/ui/data-table";
import { Camera } from "lucide-react";

export const metadata: Metadata = {
  title: "Dashboard | Fitwell Admin",
};

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const { from, to, granularity } = parseDateRange(params);
  // Table (numbers) vs graph (per-tile line charts), driven by the top-bar
  // toggle. Each tile renders the same metric either way.
  const isGraph = params.view === "graph";
  // Segment scope (top-bar toggle): "all" (default) or one of the three. A
  // single WHERE condition added to every order metric query; undefined = all.
  const segment =
    params.segment === "d2c" ||
    params.segment === "tradeshow" ||
    params.segment === "b2b"
      ? params.segment
      : "all";
  const segmentCond =
    segment === "d2c"
      ? sql`${order.sourceName} IS DISTINCT FROM 'shopify_draft_order' AND ${order.sourceName} IS DISTINCT FROM 'pos'`
      : segment === "tradeshow"
        ? sql`${order.sourceName} = 'pos'`
        : segment === "b2b"
          ? sql`${order.sourceName} = 'shopify_draft_order'`
          : undefined;
  // Denominator label for the returns "% of …" captions, tracking the scope.
  const segmentDenomLabel =
    segment === "all"
      ? "total"
      : segment === "d2c"
        ? "D2C"
        : segment === "tradeshow"
          ? "Trade Show"
          : "B2B";

  // Customer-cohort scope (top-bar toggle): "all" (default), "new" (first-ever
  // order falls in range — no order before `from`), or "existing" (ordered
  // before the range). Like segmentCond, a single WHERE condition added to every
  // order query; undefined = all. The prior-buyers subquery carries the same
  // segment scope so the two filters compose ("new B2B customers", etc.).
  const customerType =
    params.customer === "new" || params.customer === "existing"
      ? params.customer
      : "all";
  const priorBuyers = sql`SELECT ${order.customerId} FROM ${order} WHERE ${order.processedAt} < ${from} AND ${order.customerId} IS NOT NULL AND ${order.cancelledAt} IS NULL AND ${order.isSample} = false${segmentCond ? sql` AND ${segmentCond}` : sql``}`;
  const customerTypeCond =
    customerType === "existing"
      ? sql`${order.customerId} IN (${priorBuyers})`
      : customerType === "new"
        ? sql`${order.customerId} IS NOT NULL AND ${order.customerId} NOT IN (${priorBuyers})`
        : undefined;

  // Bucket by the STORE timezone so the daily trend lines up with Shopify
  // (whose reports use the store day). Without `AT TIME ZONE`, evening-Pacific
  // orders fall into the next UTC day and the line is off by a day.
  const bucketExpr =
    granularity === "day"
      ? sql`date_trunc('day', (${order.processedAt} AT TIME ZONE ${sql.raw(`'${STORE_TZ}'`)}))::date`
      : granularity === "week"
        ? sql`date_trunc('week', (${order.processedAt} AT TIME ZONE ${sql.raw(`'${STORE_TZ}'`)}))::date`
        : sql`date_trunc('month', (${order.processedAt} AT TIME ZONE ${sql.raw(`'${STORE_TZ}'`)}))::date`;

  // "Total sales" reconciles with Shopify: each order's net contribution is
  // total_price minus refunds (which nets item/tax/shipping returns), summed
  // over orders that weren't cancelled. Pending/wholesale orders are included,
  // exactly as Shopify counts them — unlike the old paid-only "Revenue".
  const netSales = sql`COALESCE(SUM(${order.totalPrice} - ${order.totalRefunded}), 0)`.mapWith(Number);
  const notCancelled = sql`${order.cancelledAt} IS NULL`;
  // Exclude $0 sample/influencer-gift orders (tagged `sample` in Shopify →
  // order.is_sample) from every sales/customer metric. See b2b-samples-system.md.
  const notSample = sql`${order.isSample} = false`;

  // Segment by order source (no B2B customer tags exist in the data, so
  // `source_name` is the signal): B2B = wholesale draft orders, Trade Show =
  // in-person POS, D2C = web + everything else. (Literals in the CASE — no bound
  // params — so it's safe to reuse across SELECT + GROUP BY.)
  const segmentExpr = sql<string>`CASE
    WHEN ${order.sourceName} = 'shopify_draft_order' THEN 'b2b'
    WHEN ${order.sourceName} = 'pos' THEN 'tradeshow'
    ELSE 'd2c'
  END`;

  const [
    revenueResult,
    orderCountResult,
    customerCountResult,
    returnsResult,
    recentOrders,
    perCustomerLtv,
    perCustomerProducts,
    preRangeCustomerRows,
    dashboardConfig,
  ] = await Promise.all([
      db
        .select({ total: netSales })
        .from(order)
        .where(
          and(notCancelled, notSample, segmentCond, customerTypeCond, gte(order.processedAt, from), lte(order.processedAt, to)),
        ),
      db
        .select({ count: count() })
        .from(order)
        .where(
          and(notCancelled, notSample, segmentCond, customerTypeCond, gte(order.processedAt, from), lte(order.processedAt, to)),
        ),
      // Distinct customers who actually ordered in the period — consistent with
      // the Sales/Orders cards (both keyed off order.processedAt). The old query
      // counted customer.createdAt, which is our *sync-into-DB* timestamp, so a
      // bulk re-sync stamped ~every customer inside the window (the 14k bug).
      db
        .select({
          count: sql<number>`count(distinct ${order.customerId})`.mapWith(Number),
        })
        .from(order)
        .where(
          and(notCancelled, notSample, segmentCond, customerTypeCond, gte(order.processedAt, from), lte(order.processedAt, to)),
        ),
      // Returns: mirrors the headline cards but on refunded value. Same
      // notCancelled/notSample/date filters so it reconciles with Total sales
      // (which already subtracts these refunds). Orders/customers are counted
      // only where a refund actually occurred (totalRefunded > 0).
      db
        .select({
          total: sql<number>`COALESCE(SUM(${order.totalRefunded}), 0)`.mapWith(Number),
          orders: sql<number>`COUNT(*) FILTER (WHERE ${order.totalRefunded} > 0)`.mapWith(Number),
          customers:
            sql<number>`COUNT(DISTINCT ${order.customerId}) FILTER (WHERE ${order.totalRefunded} > 0)`.mapWith(Number),
        })
        .from(order)
        .where(
          and(notCancelled, notSample, segmentCond, customerTypeCond, gte(order.processedAt, from), lte(order.processedAt, to)),
        ),
      db
        .select({
          id: order.id,
          shopifyOrderNumber: order.shopifyOrderNumber,
          totalPrice: order.totalPrice,
          financialStatus: order.financialStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          processedAt: order.processedAt,
          customerFirstName: customer.firstName,
          customerLastName: customer.lastName,
          customerEmail: customer.email,
        })
        .from(order)
        .leftJoin(customer, eq(order.customerId, customer.id))
        .where(and(notSample, segmentCond, customerTypeCond, gte(order.processedAt, from), lte(order.processedAt, to)))
        .orderBy(desc(order.processedAt))
        .limit(10),
      // Per-customer aggregates for the LTV / retention table, scoped to the
      // SELECTED date range (so the segment totals reconcile with the top cards).
      // One row per customer: whether they're B2B (ever placed a draft order in
      // range), their net revenue in range, their in-range order count, and the
      // timestamps of their first and second orders in range (for the repeat
      // windows). `secondOrder` is the 2nd element of the order-sorted timestamp
      // array; it's null for one-and-done customers. No bound params in the CASE.
      db
        .select({
          customerId: order.customerId,
          isB2b: sql<boolean>`bool_or(${order.sourceName} = 'shopify_draft_order')`,
          hasPos: sql<boolean>`bool_or(${order.sourceName} = 'pos')`,
          netRev: sql<number>`COALESCE(SUM(${order.totalPrice} - ${order.totalRefunded}), 0)`.mapWith(Number),
          orders: sql<number>`count(*)`.mapWith(Number),
          firstOrder: sql<string | null>`min(${order.processedAt})`,
          secondOrder: sql<string | null>`(array_agg(${order.processedAt} ORDER BY ${order.processedAt}))[2]`,
        })
        .from(order)
        .where(
          and(
            notCancelled,
            notSample,
            segmentCond,
            customerTypeCond,
            sql`${order.customerId} IS NOT NULL`,
            gte(order.processedAt, from),
            lte(order.processedAt, to),
          ),
        )
        .groupBy(order.customerId),
      // Per-customer product counts (sum of line-item quantities) in range.
      // Keyed by customerId so it merges onto the perCustomerLtv rows — the
      // customer set (and therefore the Customers column) stays identical to the
      // orders table; customers with no line items simply contribute 0 products.
      db
        .select({
          customerId: order.customerId,
          products: sql<number>`COALESCE(SUM(${orderLineItem.quantity}), 0)`.mapWith(Number),
        })
        .from(order)
        .innerJoin(orderLineItem, eq(orderLineItem.orderId, order.id))
        .where(
          and(
            notCancelled,
            notSample,
            segmentCond,
            customerTypeCond,
            sql`${order.customerId} IS NOT NULL`,
            gte(order.processedAt, from),
            lte(order.processedAt, to),
          ),
        )
        .groupBy(order.customerId),
      // Customers who placed an order BEFORE the range start — i.e. they were
      // already customers, not newly acquired in the period. Used to restrict the
      // repeat-window cohort to first-time buyers acquired in range (a customer
      // who bought before the window and again inside it must NOT count as a
      // repeat). Same notSample/notCancelled filters as everything else.
      db
        .selectDistinct({ customerId: order.customerId })
        .from(order)
        .where(
          and(
            notCancelled,
            notSample,
            segmentCond,
            customerTypeCond,
            sql`${order.customerId} IS NOT NULL`,
            lt(order.processedAt, from),
          ),
        ),
      getDashboardSettings(),
    ]);
  const { returnLabelCostCents } = dashboardConfig;

  const totalRevenue = Number(revenueResult[0]?.total ?? 0);
  const totalOrders = orderCountResult[0]?.count ?? 0;
  const totalCustomers = customerCountResult[0]?.count ?? 0;
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  const totalReturns = Number(returnsResult[0]?.total ?? 0);
  const returnOrders = returnsResult[0]?.orders ?? 0;
  const returnCustomers = returnsResult[0]?.customers ?? 0;
  // Shipping-label cost the business eats across all returns: one assumed label
  // per refunded order (returnLabelCostCents — set in admin Settings; an
  // estimate, since Shopify doesn't expose the real label cost via API).
  const returnsLabelCost = returnOrders * returnLabelCostCents;
  // Total + avg cost of returns BOTH fold in that label cost (refunds + labels).
  const totalReturnsWithShipping = totalReturns + returnsLabelCost;
  const avgReturnValue =
    returnOrders > 0 ? Math.round(totalReturnsWithShipping / returnOrders) : 0;
  // Each return metric as a share of its sales counterpart, within the current
  // segment scope (denominator = the scoped Total sales / Orders / Customers /
  // AOV; label tracks the scope — "% of total" for All, "% of D2C", etc.).
  // "—" when the denominator is 0 to avoid a divide-by-zero.
  const pctOf = (part: number, whole: number) =>
    whole > 0
      ? `${((part / whole) * 100).toFixed(1)}% of ${segmentDenomLabel}`
      : "—";

  // ── Customer value & retention (scoped to the selected date range) ─────
  // Net revenue per customer over orders in range — the assumption-free measure
  // (same shape as Shopify's customer "lifetime value", but bounded to the
  // selected window rather than all-time, so the segment totals reconcile with
  // the top cards). A predictive CLV (AOV × frequency × lifespan) is NOT used: it
  // bakes in a churn/lifespan model we'd be guessing at, whereas the repeat
  // windows below give the retention signal directly. Customer segment by
  // priority: B2B (ever placed a draft order in range) > Trade Show (ever bought
  // in-person via POS) > D2C (purely online).
  //
  // Repeat-purchase windows measure customers NEWLY ACQUIRED in the period —
  // those whose first-ever order falls in range (no order before `from`). Of
  // that cohort, each window is the share who placed a 2nd in-period order
  // within X days of their first. One shared denominator (the cohort) across
  // all columns ⇒ directly comparable, monotonic. See `computeRepeatWindows`.
  const rangeDays = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
  // Customers who already existed before the range — excluded from the cohort.
  const preRangeCustomers = new Set(
    preRangeCustomerRows
      .map((r) => r.customerId)
      .filter((id): id is string => id != null),
  );

  // In-range products bought per customer, keyed for merge onto the LTV rows.
  const productsByCustomer = new Map<string, number>();
  for (const p of perCustomerProducts) {
    if (p.customerId) productsByCustomer.set(p.customerId, p.products ?? 0);
  }

  // Tally per-customer rows in JS (small set). Repeat-window timings are
  // collected per segment and handed to the shared-cohort helper afterward.
  const ltvAgg = {
    d2c: { customers: 0, rev: 0, orders: 0, products: 0 },
    tradeshow: { customers: 0, rev: 0, orders: 0, products: 0 },
    b2b: { customers: 0, rev: 0, orders: 0, products: 0 },
  };
  const segTimings: Record<keyof typeof ltvAgg, RepeatTiming[]> = {
    d2c: [],
    tradeshow: [],
    b2b: [],
  };
  for (const c of perCustomerLtv) {
    const seg: keyof typeof ltvAgg = c.isB2b
      ? "b2b"
      : c.hasPos
        ? "tradeshow"
        : "d2c";
    const bucket = ltvAgg[seg];
    bucket.customers += 1;
    bucket.rev += c.netRev ?? 0;
    bucket.orders += c.orders ?? 0;
    bucket.products += c.customerId
      ? (productsByCustomer.get(c.customerId) ?? 0)
      : 0;
    segTimings[seg].push({
      // Newly acquired in period: had no order before the range start. (For such
      // a customer the first in-range order IS their first-ever order.)
      newlyAcquired: c.customerId != null && !preRangeCustomers.has(c.customerId),
      firstOrderMs: c.firstOrder ? new Date(c.firstOrder).getTime() : null,
      secondOrderMs: c.secondOrder ? new Date(c.secondOrder).getTime() : null,
    });
  }
  const windowsBySeg = {
    d2c: computeRepeatWindows(segTimings.d2c, rangeDays),
    tradeshow: computeRepeatWindows(segTimings.tradeshow, rangeDays),
    b2b: computeRepeatWindows(segTimings.b2b, rangeDays),
  };
  const ltvRows = (
    [
      { key: "d2c", label: "D2C (Online)" },
      { key: "tradeshow", label: "Trade Show" },
      { key: "b2b", label: "B2B (Wholesale)" },
    ] as const
  ).map(({ key, label }) => {
    const s = ltvAgg[key];
    const win = windowsBySeg[key];
    return {
      key,
      label,
      avgLtv: s.customers > 0 ? Math.round(s.rev / s.customers) : 0,
      avgOrders: s.customers > 0 ? s.orders / s.customers : 0,
      avgProducts: s.customers > 0 ? s.products / s.customers : 0,
      customers: s.customers,
      windows: win.cells.map((c) => ({
        key: c.key,
        label: c.label,
        supported: c.supported,
        cohort: win.cohort,
        rate: c.rate,
      })),
    };
  });

  // ── Per-tile time series (graph view) ────────────────────────────
  // One bucketed pass over the SAME orders the tiles count (notCancelled +
  // notSample, in range), so each tile's line chart reconciles with its number.
  const bucketKeys = generateBucketKeys(from, to, granularity);
  const [metricsByBucket, segmentByBucket, productsByBucket] = await Promise.all([
    db
      .select({
        bucket: bucketExpr,
        sales: netSales,
        orders: count(),
        customers: sql<number>`count(distinct ${order.customerId})`.mapWith(Number),
        returns: sql<number>`COALESCE(SUM(${order.totalRefunded}), 0)`.mapWith(Number),
        ordersRefunded: sql<number>`COUNT(*) FILTER (WHERE ${order.totalRefunded} > 0)`.mapWith(Number),
        customersRefunded:
          sql<number>`COUNT(DISTINCT ${order.customerId}) FILTER (WHERE ${order.totalRefunded} > 0)`.mapWith(Number),
      })
      .from(order)
      .where(
        and(notCancelled, notSample, segmentCond, customerTypeCond, gte(order.processedAt, from), lte(order.processedAt, to)),
      )
      .groupBy(bucketExpr)
      .orderBy(bucketExpr),
    // Per (bucket × segment) revenue / customers / orders — feeds the Customer
    // Value chart. No line-item join here, so counts aren't inflated.
    db
      .select({
        bucket: bucketExpr,
        segment: segmentExpr,
        revenue: netSales,
        customers: sql<number>`count(distinct ${order.customerId})`.mapWith(Number),
        orders: count(),
      })
      .from(order)
      .where(
        and(notCancelled, notSample, segmentCond, customerTypeCond, gte(order.processedAt, from), lte(order.processedAt, to)),
      )
      .groupBy(bucketExpr, segmentExpr),
    // Per (bucket × segment) product units — separate query because the line-
    // item join would multiply order rows and inflate the counts above.
    db
      .select({
        bucket: bucketExpr,
        segment: segmentExpr,
        products: sql<number>`COALESCE(SUM(${orderLineItem.quantity}), 0)`.mapWith(Number),
      })
      .from(order)
      .innerJoin(orderLineItem, eq(orderLineItem.orderId, order.id))
      .where(
        and(notCancelled, notSample, segmentCond, customerTypeCond, gte(order.processedAt, from), lte(order.processedAt, to)),
      )
      .groupBy(bucketExpr, segmentExpr),
  ]);

  type MetricBucketRow = (typeof metricsByBucket)[number];
  const metricRowByBucket = new Map<string, MetricBucketRow>();
  for (const row of metricsByBucket) {
    metricRowByBucket.set(
      dateToBucketKey(new Date(row.bucket as string), granularity),
      row,
    );
  }
  const pct = (part: number, whole: number) =>
    whole > 0 ? (part / whole) * 100 : 0;
  // Zero-filled series across all buckets. `pctOf` (optional) adds the companion
  // percentage line for the returns tiles.
  const buildSeries = (
    valueOf: (r: MetricBucketRow) => number,
    pctOf?: (r: MetricBucketRow) => number,
  ) =>
    bucketKeys.map((key) => {
      const r = metricRowByBucket.get(key);
      return {
        label: formatBucketLabel(key, granularity),
        value: r ? valueOf(r) : 0,
        ...(pctOf ? { pct: r ? pctOf(r) : 0 } : {}),
      };
    });
  // Per-bucket derived metrics mirror the headline tile definitions exactly.
  const bucketReturnsWithShipping = (r: MetricBucketRow) =>
    Number(r.returns) + r.ordersRefunded * returnLabelCostCents;
  const bucketAvgReturnValue = (r: MetricBucketRow) =>
    r.ordersRefunded > 0
      ? Math.round(bucketReturnsWithShipping(r) / r.ordersRefunded)
      : 0;
  const bucketAov = (r: MetricBucketRow) =>
    r.orders > 0 ? Math.round(Number(r.sales) / r.orders) : 0;
  const series = {
    sales: buildSeries((r) => Number(r.sales)),
    orders: buildSeries((r) => r.orders),
    customers: buildSeries((r) => r.customers),
    avgOrderValue: buildSeries((r) =>
      r.orders > 0 ? Math.round(Number(r.sales) / r.orders) : 0,
    ),
    totalReturns: buildSeries(bucketReturnsWithShipping, (r) =>
      pct(bucketReturnsWithShipping(r), Number(r.sales)),
    ),
    ordersRefunded: buildSeries(
      (r) => r.ordersRefunded,
      (r) => pct(r.ordersRefunded, r.orders),
    ),
    customersRefunded: buildSeries(
      (r) => r.customersRefunded,
      (r) => pct(r.customersRefunded, r.customers),
    ),
    avgReturnValue: buildSeries(bucketAvgReturnValue, (r) =>
      pct(bucketAvgReturnValue(r), bucketAov(r)),
    ),
  };

  // Per (bucket × segment) data for the Customer Value chart.
  const segKey = (bucketKey: string, seg: string) => `${bucketKey}|${seg}`;
  const segAggByKey = new Map<
    string,
    { revenue: number; customers: number; orders: number }
  >();
  for (const row of segmentByBucket) {
    segAggByKey.set(
      segKey(dateToBucketKey(new Date(row.bucket as string), granularity), row.segment),
      { revenue: Number(row.revenue), customers: row.customers, orders: row.orders },
    );
  }
  const productsByKey = new Map<string, number>();
  for (const row of productsByBucket) {
    productsByKey.set(
      segKey(dateToBucketKey(new Date(row.bucket as string), granularity), row.segment),
      Number(row.products),
    );
  }
  const segPoint = (bucketKey: string, seg: string) => {
    const a = segAggByKey.get(segKey(bucketKey, seg)) ?? {
      revenue: 0,
      customers: 0,
      orders: 0,
    };
    return { ...a, products: productsByKey.get(segKey(bucketKey, seg)) ?? 0 };
  };
  // Customer Value (graph): raw per-segment aggregates; the client component
  // derives the selected metric (avg revenue/orders/products per customer, or
  // customer count) on toggle.
  const customerValueData = bucketKeys.map((key) => ({
    label: formatBucketLabel(key, granularity),
    d2c: segPoint(key, "d2c"),
    tradeshow: segPoint(key, "tradeshow"),
    b2b: segPoint(key, "b2b"),
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Dashboard" />
        <div className="flex flex-wrap items-center gap-3">
          {/* Scope the whole dashboard to a sales segment (All / D2C / …). */}
          <SegmentToggle />
          {/* Scope to a customer cohort (All / New / Existing). */}
          <CustomerToggle />
          {/* Table (numbers) vs graph (per-tile line charts). */}
          <DashboardViewToggle />
          {/* Fast path to the trade-show capture flow — the dashboard is where
              you land on login, so this is the quickest way to a new lead. */}
          <Button asChild size="lg">
            <Link href="/leads/capture">
              <Camera className="h-5 w-5" /> Capture Business Card
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total sales"
          value={fmt(totalRevenue)}
          graph={isGraph}
          series={series.sales}
          seriesFormat="currency"
        />
        <MetricCard
          label="Orders"
          value={totalOrders.toLocaleString()}
          graph={isGraph}
          series={series.orders}
          seriesFormat="number"
        />
        <MetricCard
          label="Customers"
          value={totalCustomers.toLocaleString()}
          graph={isGraph}
          series={series.customers}
          seriesFormat="number"
        />
        <MetricCard
          label="Avg Order Value"
          value={fmt(avgOrderValue)}
          graph={isGraph}
          series={series.avgOrderValue}
          seriesFormat="currency"
        />
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total returns"
          value={fmt(totalReturnsWithShipping)}
          caption={`${pctOf(totalReturnsWithShipping, totalRevenue)} · incl. ${fmt(returnsLabelCost)} est. labels`}
          graph={isGraph}
          series={series.totalReturns}
          seriesFormat="currency"
          showPct
          pctLabel={segmentDenomLabel}
        />
        <MetricCard
          label="Orders refunded"
          value={returnOrders.toLocaleString()}
          caption={pctOf(returnOrders, totalOrders)}
          graph={isGraph}
          series={series.ordersRefunded}
          seriesFormat="number"
          showPct
          pctLabel={segmentDenomLabel}
        />
        <MetricCard
          label="Customers refunded"
          value={returnCustomers.toLocaleString()}
          caption={pctOf(returnCustomers, totalCustomers)}
          graph={isGraph}
          series={series.customersRefunded}
          seriesFormat="number"
          showPct
          pctLabel={segmentDenomLabel}
        />
        <MetricCard
          label="Avg Return Value"
          value={fmt(avgReturnValue)}
          caption={`${pctOf(avgReturnValue, avgOrderValue)} · incl. ${fmt(returnLabelCostCents)} est. label`}
          graph={isGraph}
          series={series.avgReturnValue}
          seriesFormat="currency"
          showPct
          pctLabel={segmentDenomLabel}
        />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            Customer Value &amp; Retention
            <InfoTooltip>
              Everything here reflects the <em>selected date range</em>, so the
              segment customer counts add up to the Customers card above. Avg
              revenue / customer is net revenue ÷ customers within the range (not
              true lifetime — widen the range to "All" for that). Avg orders and
              avg products per customer are in-range orders / line-item
              quantities ÷ customers. Repeat-window
              rates look only at customers <em>newly acquired in this period</em>
              {" "}(first-ever order in range — anyone who ordered before the
              range is excluded): of those, the share who placed a 2nd order
              within X days of their first, with that 2nd order also in the
              period. All four columns share that one cohort, so they're directly
              comparable and only rise left to right. Windows wider than the
              range show "—". Customers are bucketed by priority: B2B (ever
              ordered wholesale) → Trade Show (ever bought in-person) → D2C
              (purely online).
            </InfoTooltip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isGraph ? (
            <CustomerValueChart data={customerValueData} segment={segment} />
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segment</TableHead>
                <TableHead className="text-right">Avg revenue / customer</TableHead>
                <TableHead className="text-right">Avg orders / customer</TableHead>
                <TableHead className="text-right">Avg products / customer</TableHead>
                {REPEAT_WINDOWS.map((w) => (
                  <TableHead key={w.key} className="text-right">
                    Repeat {w.label}
                  </TableHead>
                ))}
                <TableHead className="text-right">Customers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ltvRows
                .filter((s) => segment === "all" || s.key === segment)
                .map((s) => (
                <TableRow key={s.label}>
                  <TableCell className="font-medium text-zinc-900">
                    {s.label}
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{fmt(s.avgLtv)}</Mono>
                  </TableCell>
                  <TableCell className="text-right">
                    {s.avgOrders.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {s.avgProducts.toFixed(2)}
                  </TableCell>
                  {s.windows.map((w) => (
                    <TableCell
                      key={w.key}
                      className="text-right text-zinc-500"
                      title={
                        w.supported
                          ? `${w.cohort.toLocaleString()} customers newly acquired in period`
                          : "Window wider than the selected range — would duplicate the period total"
                      }
                    >
                      {w.rate === null ? "—" : `${w.rate}%`}
                    </TableCell>
                  ))}
                  <TableCell className="text-right text-zinc-500">
                    {s.customers.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fulfillment</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOrders.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-zinc-400"
                  >
                    No orders yet. Run the Shopify sync to populate data.
                  </TableCell>
                </TableRow>
              ) : (
                recentOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Muted>{o.shopifyOrderNumber}</Muted>
                    </TableCell>
                    <TableCell className="font-medium text-zinc-900">
                      {o.customerFirstName} {o.customerLastName}
                    </TableCell>
                    <TableCell>
                      <Mono>{fmt(o.totalPrice ?? 0)}</Mono>
                    </TableCell>
                    <TableCell>
                      <Badge>{o.financialStatus ?? "—"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge>{o.fulfillmentStatus ?? "unfulfilled"}</Badge>
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {o.processedAt
                        ? o.processedAt.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
