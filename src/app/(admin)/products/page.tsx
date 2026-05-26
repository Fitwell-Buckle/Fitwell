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
import { ListFilters } from "@/components/catalog/list-filters";

export const metadata: Metadata = {
  title: "Products | Fitwell Admin",
};

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  // Item Chooser filter: the chosen product SKU(s) (comma-separated in the URL).
  const skuSet = new Set(
    (typeof params.sku === "string" ? params.sku : "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

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

  // Item Chooser filter: keep just the chosen products' rows.
  const visibleProducts = skuSet.size
    ? products.filter((p) => skuSet.has(p.sku ?? ""))
    : products;

  return (
    <div>
      <PageHeader title="Product List" />

      <ListFilters />

      <DataTable className="mt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Incoming</TableHead>
              <TableHead className="text-right">Units Sold</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleProducts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-zinc-400"
                >
                  {skuSet.size ? "No products match." : "No product data yet."}
                </TableCell>
              </TableRow>
            ) : (
              visibleProducts.map((p, i) => (
                <TableRow key={`${p.sku}-${i}`}>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-zinc-600">
                    {p.sku ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium text-zinc-900">
                    {p.title ?? "—"}
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
