import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { order, customer } from "@/lib/schema";
import { desc, eq, and, gte, lte, count } from "drizzle-orm";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Orders | Fitwell Admin",
};

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  const status = typeof params.status === "string" ? params.status : undefined;

  const conditions = [];
  if (status) {
    conditions.push(eq(order.financialStatus, status));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [orders, totalResult] = await Promise.all([
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
        customerId: order.customerId,
      })
      .from(order)
      .leftJoin(customer, eq(order.customerId, customer.id))
      .where(where)
      .orderBy(desc(order.processedAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(order).where(where),
  ]);

  const total = totalResult[0]?.count ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <h1 className="text-2xl font-bold">Orders</h1>
      <p className="mt-1 text-sm text-zinc-500">All orders synced from Shopify</p>

      <form action="" method="GET" className="mt-6 flex gap-2 items-center">
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
        >
          <option value="">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="refunded">Refunded</option>
          <option value="partially_refunded">Partially Refunded</option>
          <option value="voided">Voided</option>
        </select>
        <Button type="submit">Filter</Button>
        {status && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/orders">Clear</Link>
          </Button>
        )}
      </form>

      <div className="mt-6 rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Financial Status</TableHead>
              <TableHead>Fulfillment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-zinc-400"
                >
                  {status
                    ? "No orders match that filter."
                    : "No orders yet. Run the Shopify sync to populate data."}
                </TableCell>
              </TableRow>
            ) : (
              orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">
                    #{o.shopifyOrderNumber}
                  </TableCell>
                  <TableCell>
                    {o.processedAt
                      ? o.processedAt.toLocaleDateString("en-US")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {o.customerId ? (
                      <Link
                        href={`/customers/${o.customerId}`}
                        className="text-blue-600 hover:underline"
                      >
                        {o.customerFirstName} {o.customerLastName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{fmt(o.totalPrice ?? 0)}</TableCell>
                  <TableCell>{o.financialStatus ?? "—"}</TableCell>
                  <TableCell>{o.fulfillmentStatus ?? "unfulfilled"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Page {page} of {totalPages} ({total} orders)
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/orders?page=${page - 1}${status ? `&status=${encodeURIComponent(status)}` : ""}`}
                >
                  Previous
                </Link>
              </Button>
            )}
            {page < totalPages && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/orders?page=${page + 1}${status ? `&status=${encodeURIComponent(status)}` : ""}`}
                >
                  Next
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
