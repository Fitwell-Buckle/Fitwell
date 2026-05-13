import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { order, customer } from "@/lib/schema";
import { sql, eq, desc, count, sum, gte, lte, and } from "drizzle-orm";
import { parseDateRange } from "@/lib/date-range";
import { MetricCard } from "@/components/charts/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Mono, Muted } from "@/components/ui/data-table";

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
  const { from, to } = parseDateRange(params);

  const [revenueResult, orderCountResult, customerCountResult, recentOrders] =
    await Promise.all([
      db
        .select({ total: sum(order.totalPrice) })
        .from(order)
        .where(
          and(
            sql`${order.financialStatus} IN ('paid', 'partially_refunded')`,
            gte(order.processedAt, from),
            lte(order.processedAt, to),
          ),
        ),
      db
        .select({ count: count() })
        .from(order)
        .where(and(gte(order.processedAt, from), lte(order.processedAt, to))),
      db
        .select({ count: count() })
        .from(customer)
        .where(and(gte(customer.createdAt, from), lte(customer.createdAt, to))),
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
        .where(and(gte(order.processedAt, from), lte(order.processedAt, to)))
        .orderBy(desc(order.processedAt))
        .limit(10),
    ]);

  const totalRevenue = Number(revenueResult[0]?.total ?? 0);
  const totalOrders = orderCountResult[0]?.count ?? 0;
  const totalCustomers = customerCountResult[0]?.count ?? 0;
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  return (
    <div>
      <PageHeader title="Dashboard" />

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Revenue" value={fmt(totalRevenue)} />
        <MetricCard label="Orders" value={totalOrders.toLocaleString()} />
        <MetricCard label="Customers" value={totalCustomers.toLocaleString()} />
        <MetricCard label="Avg Order Value" value={fmt(avgOrderValue)} />
      </div>

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
