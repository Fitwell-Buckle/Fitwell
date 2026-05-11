import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { order, customer } from "@/lib/schema";
import { sql, eq, desc, count, sum } from "drizzle-orm";
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

export const metadata: Metadata = {
  title: "Dashboard | Fitwell Admin",
};

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const [revenueResult, orderCountResult, customerCountResult, recentOrders] =
    await Promise.all([
      db
        .select({ total: sum(order.totalPrice) })
        .from(order)
        .where(
          sql`${order.financialStatus} IN ('paid', 'partially_refunded')`,
        ),
      db.select({ count: count() }).from(order),
      db.select({ count: count() }).from(customer),
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
        .orderBy(desc(order.processedAt))
        .limit(10),
    ]);

  const totalRevenue = Number(revenueResult[0]?.total ?? 0);
  const totalOrders = orderCountResult[0]?.count ?? 0;
  const totalCustomers = customerCountResult[0]?.count ?? 0;
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Overview of key business metrics
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Revenue" value={fmt(totalRevenue)} />
        <MetricCard label="Orders" value={totalOrders.toLocaleString()} />
        <MetricCard label="Customers" value={totalCustomers.toLocaleString()} />
        <MetricCard label="AOV" value={fmt(avgOrderValue)} />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-lg">Recent Orders</CardTitle>
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
                    <TableCell className="font-medium">
                      <Link
                        href={`/orders`}
                        className="text-blue-600 hover:underline"
                      >
                        #{o.shopifyOrderNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {o.customerFirstName} {o.customerLastName}
                    </TableCell>
                    <TableCell>{fmt(o.totalPrice ?? 0)}</TableCell>
                    <TableCell>{o.financialStatus ?? "—"}</TableCell>
                    <TableCell>{o.fulfillmentStatus ?? "unfulfilled"}</TableCell>
                    <TableCell>
                      {o.processedAt
                        ? o.processedAt.toLocaleDateString("en-US")
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
