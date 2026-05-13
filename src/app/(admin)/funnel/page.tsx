import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { order, customer, ga4Daily } from "@/lib/schema";
import { sql, gte, lte, and, count, sum } from "drizzle-orm";
import { parseDateRange } from "@/lib/date-range";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/charts/metric-card";
import { Mono } from "@/components/ui/data-table";

export const metadata: Metadata = {
  title: "Conversion Funnel | Fitwell Admin",
};

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function pct(a: number, b: number) {
  if (b === 0) return "—";
  return `${((a / b) * 100).toFixed(1)}%`;
}

export default async function FunnelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const { from, to } = parseDateRange(params);

  const [
    sessionData,
    orderData,
    customerData,
    webOrders,
    draftOrders,
    repeatCustomers,
  ] = await Promise.all([
    db
      .select({
        sessions: sum(ga4Daily.sessions).mapWith(Number),
        users: sum(ga4Daily.users).mapWith(Number),
      })
      .from(ga4Daily)
      .where(and(gte(ga4Daily.date, from), lte(ga4Daily.date, to))),

    db
      .select({
        total: count(),
        revenue: sum(order.totalPrice).mapWith(Number),
      })
      .from(order)
      .where(and(gte(order.processedAt, from), lte(order.processedAt, to))),

    db
      .select({ total: count() })
      .from(customer)
      .where(and(gte(customer.createdAt, from), lte(customer.createdAt, to))),

    db
      .select({ total: count() })
      .from(order)
      .where(
        sql`${order.processedAt} >= ${from} AND ${order.processedAt} <= ${to} AND ${order.sourceName} = 'web'`,
      ),

    db
      .select({ total: count() })
      .from(order)
      .where(
        sql`${order.processedAt} >= ${from} AND ${order.processedAt} <= ${to} AND ${order.sourceName} = 'shopify_draft_order'`,
      ),

    db
      .select({ total: count() })
      .from(customer)
      .where(sql`${customer.orderCount} > 1`),
  ]);

  const sessions = sessionData[0]?.sessions ?? 0;
  const users = sessionData[0]?.users ?? 0;
  const orders = orderData[0]?.total ?? 0;
  const revenue = orderData[0]?.revenue ?? 0;
  const newCustomers = customerData[0]?.total ?? 0;
  const webOrderCount = webOrders[0]?.total ?? 0;
  const draftOrderCount = draftOrders[0]?.total ?? 0;
  const repeatCount = repeatCustomers[0]?.total ?? 0;

  const stages = [
    { label: "Sessions (GA4)", value: sessions },
    { label: "Unique Users", value: users },
    { label: "Orders (Web)", value: webOrderCount },
    { label: "Orders (All)", value: orders },
  ];

  return (
    <div>
      <PageHeader title="Conversion Funnel" />

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="30d Revenue"
          value={fmt(revenue)}
        />
        <MetricCard
          label="30d Orders"
          value={orders.toLocaleString()}
        />
        <MetricCard
          label="New Customers"
          value={newCustomers.toLocaleString()}
        />
        <MetricCard
          label="Repeat Customers"
          value={repeatCount.toLocaleString()}
        />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Funnel (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stages.map((stage, i) => {
                const prev = i > 0 ? stages[i - 1].value : stage.value;
                const width = stages[0].value > 0
                  ? Math.max(8, (stage.value / stages[0].value) * 100)
                  : 100;
                return (
                  <div key={stage.label}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span className="text-zinc-600">{stage.label}</span>
                      <span className="font-mono font-medium text-zinc-900">
                        {stage.value.toLocaleString()}
                        {i > 0 && (
                          <span className="ml-2 text-xs text-zinc-400">
                            {pct(stage.value, prev)} of prev
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-6 rounded bg-zinc-100">
                      <div
                        className="h-6 rounded bg-zinc-900 transition-all"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-zinc-400">
              Session → Purchase: <Mono>{pct(webOrderCount, sessions)}</Mono>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Channel Breakdown (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-zinc-600">Web (DTC)</span>
                <span className="font-mono font-medium text-zinc-900">
                  {webOrderCount.toLocaleString()} orders
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-zinc-600">
                  Wholesale / Draft Orders
                </span>
                <span className="font-mono font-medium text-zinc-900">
                  {draftOrderCount.toLocaleString()} orders
                </span>
              </div>
              <div className="flex items-baseline justify-between border-t border-zinc-100 pt-4">
                <span className="text-sm font-medium text-zinc-900">
                  Total
                </span>
                <span className="font-mono font-medium text-zinc-900">
                  {orders.toLocaleString()} orders
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
