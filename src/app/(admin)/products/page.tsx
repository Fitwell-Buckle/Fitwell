import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { orderLineItem, order } from "@/lib/schema";
import { sql, sum, count } from "drizzle-orm";
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
  title: "Products | Fitwell Admin",
};

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function ProductsPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const products = await db
    .select({
      sku: orderLineItem.sku,
      title: orderLineItem.title,
      unitsSold: sum(orderLineItem.quantity).mapWith(Number),
      orderCount: count(sql`DISTINCT ${orderLineItem.orderId}`),
      revenue: sql<number>`coalesce(sum(${orderLineItem.price} * ${orderLineItem.quantity}), 0)::int`,
    })
    .from(orderLineItem)
    .groupBy(orderLineItem.sku, orderLineItem.title)
    .orderBy(sql`sum(${orderLineItem.quantity}) desc`);

  return (
    <div>
      <h1 className="text-2xl font-bold">Products</h1>
      <p className="mt-1 text-sm text-zinc-500">
        SKU-level sales data from synced orders
      </p>

      <div className="mt-8 rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Units Sold</TableHead>
              <TableHead>Orders</TableHead>
              <TableHead>Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-zinc-400"
                >
                  No product data yet. Run the Shopify sync to populate orders.
                </TableCell>
              </TableRow>
            ) : (
              products.map((p, i) => (
                <TableRow key={`${p.sku}-${i}`}>
                  <TableCell className="font-medium">
                    {p.title ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {p.sku ?? "—"}
                  </TableCell>
                  <TableCell>{p.unitsSold ?? 0}</TableCell>
                  <TableCell>{p.orderCount}</TableCell>
                  <TableCell>{fmt(Number(p.revenue) || 0)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
