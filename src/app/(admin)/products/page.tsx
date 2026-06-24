import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { SectionTabs } from "@/components/ui/section-tabs";
import { PRODUCTS_TABS } from "@/lib/nav-tabs";
import { DataTable, Mono, Muted } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { ListFilters } from "@/components/catalog/list-filters";
import { RefreshCatalogButton } from "@/components/catalog/refresh-catalog-button";
import { getProductList, buildListQuery } from "@/lib/catalog/product-list";
import { ProductRow } from "./product-row";
import { StopPropagationLink } from "./stop-propagation-link";

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

  // Shared list builder (same ordering the detail page reuses for Prev/Next).
  const {
    visible: visibleProducts,
    incomingBySku,
    skuCollisions,
    skuSet,
  } = await getProductList(params);

  // Carry the current filter + date range into each product link so the detail
  // page can rebuild this exact list for its Prev/Next navigation.
  const listQuery = buildListQuery(params);
  const detailHref = (sku: string) =>
    `/products/${encodeURIComponent(sku)}${listQuery ? `?${listQuery}` : ""}`;

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title="Products" />
        <RefreshCatalogButton />
      </div>
      <SectionTabs tabs={PRODUCTS_TABS} />

      {skuCollisions.length > 0 && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm">
          <p className="font-medium text-red-800">
            Duplicate SKUs — {skuCollisions.length} SKU
            {skuCollisions.length === 1 ? " is" : "s are"} assigned to more than one product.
          </p>
          <p className="mt-1 text-red-700">
            SKU is the unique key across products, orders, inventory and labels, so a duplicate
            shows the wrong product (only one of each appears in this list). Give each variant a
            unique SKU in Shopify.
          </p>
          <ul className="mt-2 space-y-1 text-red-700">
            {skuCollisions.map((c) => (
              <li key={c.sku}>
                <span className="font-mono text-xs">{c.sku}</span> →{" "}
                {c.products.map((p) => p.label).join("  ·  ")}
              </li>
            ))}
          </ul>
        </div>
      )}

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
              <TableHead className="text-center">Shopify</TableHead>
              <TableHead className="w-0" aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleProducts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-zinc-400"
                >
                  {skuSet.size ? "No products match." : "No product data yet."}
                </TableCell>
              </TableRow>
            ) : (
              visibleProducts.map((p) => {
                const cells = (
                  <>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-zinc-600">
                      {p.sku || "—"}
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
                    <TableCell className="text-center">
                      {p.onShopify ? (
                        <Badge className="bg-green-100 text-green-700">
                          <Check className="mr-1 h-3 w-3" /> On Shopify
                        </Badge>
                      ) : (
                        <Muted>—</Muted>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap pr-2 text-right">
                      {p.sku ? (
                        <StopPropagationLink
                          href={`/products/${encodeURIComponent(p.sku)}/label`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800 hover:decoration-zinc-600"
                          title="Open the printable packaging label for this SKU"
                        >
                          Label
                        </StopPropagationLink>
                      ) : null}
                    </TableCell>
                  </>
                );
                return p.sku ? (
                  <ProductRow key={p.key} href={detailHref(p.sku)}>
                    {cells}
                  </ProductRow>
                ) : (
                  <TableRow key={p.key}>{cells}</TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </DataTable>
    </div>
  );
}
