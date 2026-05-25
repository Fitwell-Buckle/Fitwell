import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supplier } from "@/lib/schema";
import { getInvoiceDetail } from "@/lib/invoicing/service";
import { getBillingSettings, hasRemittance } from "@/lib/invoicing/billing-settings";
import { remittanceRows } from "@/lib/invoicing/email";
import {
  INVOICE_STATUS_LABELS,
  invoiceStatusBadgeClass,
  type InvoiceStatus,
} from "@/lib/invoicing/invoicing";
import { fmtDate, fmtMoney } from "@/lib/production/display";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { InvoiceActions } from "./invoice-actions";

export const metadata: Metadata = {
  title: "Invoice | Fitwell Admin",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;
  const [inv, suppliers, billing] = await Promise.all([
    getInvoiceDetail(id),
    db.query.supplier.findMany({
      columns: { id: true, name: true },
      orderBy: asc(supplier.name),
    }),
    getBillingSettings(),
  ]);
  if (!inv) notFound();

  const editable = inv.status === "draft" || inv.status === "sent";

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title={`Invoice ${inv.invoiceNumber}`} />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/invoices/${inv.id}/send`}>Print &amp; Send</Link>
          </Button>
          {editable && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/invoices/${inv.id}/edit`}>Edit</Link>
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link href="/invoices">Back</Link>
          </Button>
        </div>
      </div>

      <Card className="mt-6 p-6">
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div className="sm:col-span-2">
            <div className="text-xs text-zinc-400">Bill to</div>
            <div className="mt-1 font-medium text-zinc-900">{inv.company?.name ?? "—"}</div>
            {inv.company?.contactName && (
              <div className="text-zinc-500">{inv.company.contactName}</div>
            )}
            {inv.company?.contactEmail && (
              <div className="text-zinc-500">{inv.company.contactEmail}</div>
            )}
            {inv.company?.priceTier && (
              <div className="mt-1 text-xs text-zinc-400">
                {inv.company.priceTier.name} ({inv.company.priceTier.discountPercent}% off)
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-zinc-400">Status</div>
            <div className="mt-1">
              <Badge className={cn(invoiceStatusBadgeClass(inv.status))}>
                {INVOICE_STATUS_LABELS[inv.status as InvoiceStatus] ?? inv.status}
              </Badge>
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-400">Source PO</div>
            <div className="mt-1 text-zinc-700">
              {inv.sourcePo ? (
                <Link
                  href={`/modules/production/po/${inv.sourcePo.id}`}
                  className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                >
                  {inv.sourcePo.shopifyPoNumber}
                </Link>
              ) : (
                "—"
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-400">Issued</div>
            <div className="mt-1 text-zinc-700">{fmtDate(inv.issuedDate)}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-400">Due</div>
            <div className="mt-1 text-zinc-700">{fmtDate(inv.dueDate)}</div>
          </div>
        </div>
        {inv.notes && <p className="mt-4 text-sm text-zinc-600">{inv.notes}</p>}
      </Card>

      <Card className="mt-5 p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Line items</h2>
        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Line total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inv.lineItems.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                  <TableCell>{l.title}</TableCell>
                  <TableCell className="text-right text-zinc-500">{l.quantity}</TableCell>
                  <TableCell className="text-right text-zinc-500">
                    {fmtMoney(l.unitPriceCents)}
                  </TableCell>
                  <TableCell className="text-right text-zinc-700">
                    {fmtMoney(l.unitPriceCents * l.quantity)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 space-y-1 border-t border-zinc-100 pt-3 text-sm">
          <div className="flex justify-end gap-6 text-zinc-500">
            <span>Subtotal</span>
            <span className="w-28 text-right text-zinc-700">{fmtMoney(inv.subtotalCents)}</span>
          </div>
          <div className="flex justify-end gap-6 text-zinc-500">
            <span>Discount ({inv.discountPercent ?? 0}%)</span>
            <span className="w-28 text-right text-zinc-700">−{fmtMoney(inv.discountCents)}</span>
          </div>
          <div className="flex justify-end gap-6 text-base font-semibold text-zinc-900">
            <span>Total</span>
            <span className="w-28 text-right">{fmtMoney(inv.totalCents)}</span>
          </div>
        </div>
      </Card>

      <Card className="mt-5 p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Payment</h2>
        <div className="mt-3">
          {inv.shopifyInvoiceUrl ? (
            <Button asChild>
              <a href={inv.shopifyInvoiceUrl} target="_blank" rel="noreferrer">
                Pay online (Apple Pay, PayPal, card)
              </a>
            </Button>
          ) : (
            <p className="text-sm text-zinc-400">
              Use “Print &amp; Send” (top right) to email this invoice with an
              online payment link.
            </p>
          )}
        </div>

        <div className="mt-5 border-t border-zinc-100 pt-4">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            Pay by bank wire / ACH
          </div>
          {hasRemittance(billing) ? (
            <dl className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
              {remittanceRows(billing!).map((r) => (
                <div key={r.label} className="flex justify-between gap-4">
                  <dt className="text-zinc-500">{r.label}</dt>
                  <dd className="text-zinc-800">{r.value}</dd>
                </div>
              ))}
              {billing!.instructions && (
                <p className="mt-1 text-xs text-zinc-500 sm:col-span-2">{billing!.instructions}</p>
              )}
            </dl>
          ) : (
            <p className="mt-2 text-sm text-zinc-400">
              Add bank-wire details in{" "}
              <Link href="/settings" className="underline underline-offset-2">
                Settings
              </Link>{" "}
              to show them here and on the invoice.
            </p>
          )}
        </div>
      </Card>

      <InvoiceActions
        invoiceId={inv.id}
        status={inv.status}
        suppliers={suppliers}
        canPushShopify={!!inv.company?.customer?.shopifyId}
        shopifyInvoiceUrl={inv.shopifyInvoiceUrl}
      />
    </div>
  );
}
