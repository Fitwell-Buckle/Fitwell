import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { orderLineItem, productionPoLineItem, productionPo } from "@/lib/schema";
import { sql, sum, count, and, eq, isNull, ne } from "drizzle-orm";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Mono, Muted } from "@/components/ui/data-table";

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

  // Incoming = produced-but-not-yet-received units, by SKU (excludes cancelled POs).
  const incomingRows = await db
    .select({
      sku: productionPoLineItem.sku,
      qty: sum(productionPoLineItem.quantity).mapWith(Number),
    })
    .from(productionPoLineItem)
    .innerJoin(productionPo, eq(productionPoLineItem.poId, productionPo.id))
    .where(
      and(
        isNull(productionPoLineItem.shopifyReceivedAt),
        ne(productionPo.status, "cancelled"),
      ),
    )
    .groupBy(productionPoLineItem.sku);
  const incomingBySku = new Map(incomingRows.map((r) => [r.sku, r.qty ?? 0]));

  return (
    <div>
      <PageHeader title="Products" />

      <DataTable className="mt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Incoming</TableHead>
              <TableHead className="text-right">Units Sold</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-zinc-400"
                >
                  No product data yet.
                </TableCell>
              </TableRow>
            ) : (
              products.map((p, i) => (
                <TableRow key={`${p.sku}-${i}`}>
                  <TableCell className="font-medium text-zinc-900">
                    {p.title ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Muted>{p.sku ?? "—"}</Muted>
                  </TableCell>
                  <TableCell className="text-right">
                    {incomingBySku.get(p.sku ?? "") ? (
                      <Mono>{incomingBySku.get(p.sku ?? "")}</Mono>
                    ) : (
                      <Muted>—</Muted>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{p.unitsSold ?? 0}</Mono>
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{p.orderCount}</Mono>
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{fmt(Number(p.revenue) || 0)}</Mono>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DataTable>
    </div>
  );
}
