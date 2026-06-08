import type { Metadata } from "next";
import Link from "next/link";
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
import { RefreshCatalogButton } from "@/components/catalog/refresh-catalog-button";
import { getCatalogCached } from "@/lib/catalog/load";

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
  // Item Chooser filter: the chosen product SKU(s). Next can deliver either a
  // single comma-separated string (?sku=A,B) or repeated keys (?sku=A&sku=B),
  // so accept both shapes.
  const rawSku = params.sku;
  const skuSet = new Set(
    (Array.isArray(rawSku) ? rawSku.join(",") : (rawSku ?? ""))
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  // Sales performance per SKU (from order line items).
  const salesRows = await db
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
  const salesBySku = new Map(salesRows.map((r) => [r.sku ?? "", r]));

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

  // The list is the whole Shopify catalog (so brand-new / unsold products show
  // too), left-joined with the sales aggregates. Falls back to sales-only if
  // Shopify is unreachable. The catalog is cached — "Refresh catalog" re-pulls it.
  type ProductRow = {
    key: string;
    sku: string;
    title: string;
    unitsSold: number;
    orderCount: number;
    revenue: number;
  };
  let catalog: Awaited<ReturnType<typeof getCatalogCached>> = [];
  try {
    catalog = await getCatalogCached();
  } catch (err) {
    console.error("products page: catalog load failed — showing sold SKUs only", err);
  }

  const rows: ProductRow[] = [];
  const seen = new Set<string>();
  // SAMPLE variants share SKUs with their customer-facing twin, and sales are
  // keyed by SKU — so listing both rows would double-count the same revenue.
  // Visit non-samples first; the duplicate SAMPLE row is then skipped by `seen`.
  const sortedCatalog = [...catalog].sort((a, b) => {
    const aSample = /sample/i.test(`${a.title ?? ""} ${a.variantTitle ?? ""}`);
    const bSample = /sample/i.test(`${b.title ?? ""} ${b.variantTitle ?? ""}`);
    return Number(aSample) - Number(bSample);
  });
  for (const v of sortedCatalog) {
    const sku = v.sku ?? "";
    if (sku && seen.has(sku)) continue;
    const s = sku ? salesBySku.get(sku) : undefined;
    rows.push({
      key: sku || v.shopifyVariantId,
      sku,
      title: v.variantTitle ? `${v.title} — ${v.variantTitle}` : v.title,
      unitsSold: Number(s?.unitsSold ?? 0),
      orderCount: Number(s?.orderCount ?? 0),
      revenue: Number(s?.revenue ?? 0),
    });
    if (sku) seen.add(sku);
  }
  // Keep historical sold SKUs no longer in the catalog (e.g. archived items).
  for (const r of salesRows) {
    const sku = r.sku ?? "";
    if (sku && seen.has(sku)) continue;
    rows.push({
      key: sku || `sold-${rows.length}`,
      sku,
      title: r.title ?? "—",
      unitsSold: Number(r.unitsSold ?? 0),
      orderCount: Number(r.orderCount ?? 0),
      revenue: Number(r.revenue ?? 0),
    });
  }
  rows.sort((a, b) => b.unitsSold - a.unitsSold || a.title.localeCompare(b.title));

  // Item Chooser filter: keep just the chosen products' rows.
  const visibleProducts = skuSet.size
    ? rows.filter((p) => skuSet.has(p.sku))
    : rows;

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title="Products" />
        <RefreshCatalogButton />
      </div>

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
              <TableHead className="w-0" aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleProducts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-zinc-400"
                >
                  {skuSet.size ? "No products match." : "No product data yet."}
                </TableCell>
              </TableRow>
            ) : (
              visibleProducts.map((p) => (
                <TableRow key={p.key}>
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
                  <TableCell className="whitespace-nowrap pr-2 text-right">
                    {p.sku ? (
                      <Link
                        href={`/products/${encodeURIComponent(p.sku)}/label`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800 hover:decoration-zinc-600"
                        title="Open the printable packaging label for this SKU"
                      >
                        Label
                      </Link>
                    ) : null}
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
