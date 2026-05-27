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
import { getStageOrder } from "@/lib/production/stage-labels";
import { aggregateIncoming, type IncomingLine } from "@/lib/production/inventory";
import { getBillingSettings } from "@/lib/invoicing/billing-settings";
import { ListFilters } from "@/components/catalog/list-filters";
import { WireInfoSetup } from "./wire-info-setup";
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
  // Item Chooser filter: the chosen product SKU(s) (comma-separated in the URL).
  const skuSet = new Set(
    (typeof params.sku === "string" ? params.sku : "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  // Production lines (for ETA) + invoices.
  const [invoices, pos, estimates, billing, order] = await Promise.all([
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
    getBillingSettings(),
    getStageOrder(),
  ]);

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
    aggregateIncoming(order, incomingLines, estimates, today).map((r) => [r.sku, r.nearestEta]),
  );

  const rows = invoices
    .filter((inv) => inv.issuedDate >= fromStr && inv.issuedDate <= toStr)
    .filter((inv) => skuSet.size === 0 || inv.lineItems.some((l) => skuSet.has(l.sku)))
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
        <div className="flex items-center gap-2">
          <WireInfoSetup initialWireInfo={billing?.instructions ?? ""} />
          <Button asChild>
            <Link href="/invoices/new">New order</Link>
          </Button>
        </div>
      </div>

      <ListFilters />

      <DataTable className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
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
