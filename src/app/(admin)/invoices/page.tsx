import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ne, desc, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invoice, productionPo } from "@/lib/schema";
import {
  INVOICE_STATUS_LABELS,
  invoiceStatusBadgeClass,
  type InvoiceStatus,
} from "@/lib/invoicing/invoicing";
import { fmtDate, fmtMoney } from "@/lib/production/display";
import { parseDateRange } from "@/lib/date-range";
import { getStageEstimates } from "@/lib/production/cycle-time-data";
import { aggregateIncoming, type IncomingLine } from "@/lib/production/inventory";
import {
  getCatalogCached,
  getCatalogGroupsCached,
  catalogSkusMatching,
  makeCollectionLookup,
  type CatalogVariant,
  type CatalogCollectionGroup,
} from "@/lib/catalog/load";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, Mono } from "@/components/ui/data-table";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "B2B Orders | Fitwell Admin",
};

export default async function B2BOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const { from, to } = parseDateRange(params);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  const collectionParam = typeof params.collection === "string" ? params.collection : "";
  const sizeParam = typeof params.size === "string" ? params.size : "";
  const colorParam = typeof params.color === "string" ? params.color : "";
  const materialParam = typeof params.material === "string" ? params.material : "";

  // Catalog (filter options + SKU set), production lines (for ETA), invoices.
  let catalog: CatalogVariant[] = [];
  let groups: CatalogCollectionGroup[] = [];
  const [invoices, pos, estimates] = await Promise.all([
    db.query.invoice.findMany({
      orderBy: desc(invoice.createdAt),
      with: {
        company: { columns: { name: true } },
        lineItems: { columns: { sku: true } },
      },
    }),
    db.query.productionPo.findMany({
      where: ne(productionPo.status, "cancelled"),
      columns: { id: true },
      with: {
        lineItems: {
          columns: {
            sku: true,
            title: true,
            quantity: true,
            currentStage: true,
            shopifyReceivedAt: true,
          },
        },
      },
    }),
    getStageEstimates(),
  ]);
  try {
    [catalog, groups] = await Promise.all([getCatalogCached(), getCatalogGroupsCached()]);
  } catch {
    /* filters degrade gracefully when Shopify is unavailable */
  }

  const { options: collectionOptions } = makeCollectionLookup(groups);
  const sizeOptions = [
    ...new Set(catalog.map((v) => v.sizeMm).filter((s): s is number => s != null)),
  ].sort((a, b) => a - b);
  const colorOptions = [
    ...new Set(catalog.map((v) => v.color).filter((c): c is string => !!c)),
  ].sort((a, b) => a.localeCompare(b));
  const materialOptions = [
    ...new Set(catalog.map((v) => v.material).filter((m): m is string => !!m)),
  ].sort((a, b) => a.localeCompare(b));
  const matchingSkus = catalogSkusMatching(catalog, groups, {
    collection: collectionParam,
    size: sizeParam,
    color: colorParam,
    material: materialParam,
  });
  const matchSet = matchingSkus ? new Set(matchingSkus) : null;

  // Production ETA per SKU = soonest projected completion across in-production
  // (not-yet-received) lines. An order's ETA is the latest of its SKUs'.
  const today = new Date().toISOString().slice(0, 10);
  const incomingLines: IncomingLine[] = pos
    .flatMap((p) => p.lineItems)
    .filter((li) => !li.shopifyReceivedAt)
    .map((li) => ({
      sku: li.sku,
      title: li.title,
      quantity: li.quantity,
      currentStage: li.currentStage,
    }));
  const etaBySku = new Map(
    aggregateIncoming(incomingLines, estimates, today).map((r) => [r.sku, r.nearestEta]),
  );

  const rows = invoices
    .filter((inv) => inv.issuedDate >= fromStr && inv.issuedDate <= toStr)
    .filter((inv) => !matchSet || inv.lineItems.some((l) => matchSet.has(l.sku)))
    .map((inv) => {
      let productionEta: string | null = null;
      for (const l of inv.lineItems) {
        const e = etaBySku.get(l.sku);
        if (e && (!productionEta || e > productionEta)) productionEta = e;
      }
      return { ...inv, productionEta };
    });

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title="B2B Orders" />
        <Button asChild>
          <Link href="/invoices/new">New order</Link>
        </Button>
      </div>

      <CatalogFilters
        collections={collectionOptions}
        collection={collectionParam}
        sizeOptions={sizeOptions}
        size={sizeParam}
        colorOptions={colorOptions}
        color={colorParam}
        materialOptions={materialOptions}
        material={materialParam}
      />

      <DataTable className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due date</TableHead>
              <TableHead>Production ETA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-zinc-400">
                  No B2B orders match.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((inv) => {
                const onTime =
                  inv.productionEta && inv.dueDate && inv.productionEta <= inv.dueDate;
                const overdue =
                  inv.productionEta && inv.dueDate && inv.productionEta > inv.dueDate;
                return (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                      >
                        <Mono>{inv.invoiceNumber}</Mono>
                      </Link>
                    </TableCell>
                    <TableCell className="text-zinc-500">{fmtDate(inv.issuedDate)}</TableCell>
                    <TableCell className="text-zinc-700">{inv.company?.name ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium text-zinc-900">
                      {fmtMoney(inv.totalCents)}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(invoiceStatusBadgeClass(inv.status))}>
                        {INVOICE_STATUS_LABELS[inv.status as InvoiceStatus] ?? inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-zinc-500">{fmtDate(inv.dueDate)}</TableCell>
                    <TableCell
                      className={cn(
                        "font-medium",
                        onTime && "text-emerald-600",
                        overdue && "text-red-600",
                        !onTime && !overdue && "text-zinc-500",
                      )}
                    >
                      {inv.productionEta ? fmtDate(inv.productionEta) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </DataTable>
    </div>
  );
}
