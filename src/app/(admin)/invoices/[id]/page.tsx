import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supplier, company, priceTier } from "@/lib/schema";
import { getInvoiceDetail } from "@/lib/invoicing/service";
import { netLineDisplays } from "@/lib/invoicing/invoicing";
import { getBillingSettings } from "@/lib/invoicing/billing-settings";
import { buildInvoiceHistory } from "@/lib/invoicing/history";
import { fmtDate, fmtMoney } from "@/lib/production/display";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { PoForm, type PoFormInitial } from "../../modules/production/po/new/po-form";
import { InvoiceActions } from "./invoice-actions";
import { InvoiceStatusSelect } from "./invoice-status-select";
import { InvoiceAttachments } from "@/components/invoicing/invoice-attachments";

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
  const [inv, suppliers, companies, tiers, billing] = await Promise.all([
    getInvoiceDetail(id),
    db.query.supplier.findMany({
      columns: {
        id: true,
        name: true,
        contactName: true,
        contactEmail: true,
        shippingAddress: true,
        notes: true,
      },
      orderBy: asc(supplier.name),
    }),
    db.query.company.findMany({
      columns: {
        id: true,
        name: true,
        contactName: true,
        contactEmail: true,
        address: true,
        customerId: true,
        priceTierId: true,
        depositPercent: true,
        notes: true,
        assignedCollectionIds: true,
        assignedProductIds: true,
      },
      orderBy: asc(company.name),
      with: { priceTier: { columns: { name: true, discountPercent: true } } },
    }),
    db.query.priceTier.findMany({
      columns: { id: true, name: true, discountPercent: true },
      orderBy: asc(priceTier.name),
    }),
    getBillingSettings(),
  ]);
  if (!inv) notFound();

  const editable = inv.status === "draft" || inv.status === "sent";
  const discountPercent = inv.discountPercent ?? 0;
  // Net (post-discount) prices the customer actually pays — shown instead of
  // retail. Foots exactly to inv.totalCents (the charged amount).
  const netLines = netLineDisplays(
    inv.lineItems.map((l) => ({ quantity: l.quantity, unitPriceCents: l.unitPriceCents })),
    discountPercent,
    inv.totalCents,
  );

  const companyOptions = companies.map((c) => ({
    id: c.id,
    name: c.name,
    contactName: c.contactName,
    contactEmail: c.contactEmail,
    address: c.address,
    customerId: c.customerId,
    priceTierId: c.priceTierId,
    tierName: c.priceTier?.name ?? null,
    tierDiscount: c.priceTier?.discountPercent ?? null,
    depositPercent: c.depositPercent ?? 0,
    notes: c.notes,
    assignedCollectionIds: c.assignedCollectionIds ?? [],
    assignedProductIds: c.assignedProductIds ?? [],
  }));

  const history = buildInvoiceHistory(
    {
      createdAt: inv.createdAt,
      sentAt: inv.sentAt,
      depositPaidAt: inv.depositPaidAt,
      fulfilledAt: inv.fulfilledAt,
      balancePaidAt: inv.balancePaidAt,
      paidAt: inv.paidAt,
    },
    { companyName: inv.company?.name ?? null },
  );

  // Prefill a new PO from this invoice's lines (production cost left blank).
  const poInitial: PoFormInitial = {
    supplierId: "",
    shopifyPoNumber: "",
    issuedDate: new Date().toISOString().slice(0, 10),
    expectedDeliveryDate: "",
    notes: `From invoice ${inv.invoiceNumber}`,
    companyId: inv.companyId,
    shopifyLocationId: "",
    locationName: "",
    lineItems: inv.lineItems.map((l) => ({
      id: "",
      sku: l.sku,
      title: l.title,
      quantity: l.quantity,
      unitCostCents: null,
      shopifyProductId: l.shopifyProductId,
      shopifyVariantId: l.shopifyVariantId,
      companyId: null,
      shopifyLocationId: null,
      locationName: null,
    })),
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <PageHeader title={`Invoice ${inv.invoiceNumber}`} />
        <div className="flex items-center gap-3">
          <InvoiceStatusSelect invoiceId={inv.id} status={inv.status} />
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
              {inv.lineItems.map((l, i) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                  <TableCell>{l.title}</TableCell>
                  <TableCell className="text-right text-zinc-500">{l.quantity}</TableCell>
                  <TableCell className="text-right text-zinc-500">
                    {fmtMoney(netLines[i].netUnitPriceCents)}
                  </TableCell>
                  <TableCell className="text-right text-zinc-700">
                    {fmtMoney(netLines[i].netLineTotalCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 space-y-1 border-t border-zinc-100 pt-3 text-sm">
          {discountPercent > 0 && (
            <div className="flex justify-end gap-6 text-zinc-400">
              <span>Includes {discountPercent}% partner pricing</span>
            </div>
          )}
          <div className="flex justify-end gap-6 text-base font-semibold text-zinc-900">
            <span>Total (USD)</span>
            <span className="w-28 text-right">{fmtMoney(inv.totalCents)}</span>
          </div>
        </div>
      </Card>

      <Card className="mt-5 p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Payment</h2>
        <div className="mt-3">
          {inv.status === "paid" ? (
            <p className="text-sm text-emerald-700">
              ✓ Paid in full
              {inv.paidAt
                ? ` ${fmtDate(inv.paidAt.toISOString().slice(0, 10))}`
                : ""}
            </p>
          ) : inv.shopifyInvoiceUrl ? (
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
          {billing?.instructions ? (
            <p className="mt-2 whitespace-pre-line text-sm font-medium text-zinc-800">
              {billing.instructions}
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-400">
              Add wire info via “Setup” on the{" "}
              <Link href="/invoices" className="underline underline-offset-2">
                B2B Orders
              </Link>{" "}
              page to show it here and on the invoice.
            </p>
          )}
        </div>
      </Card>

      <InvoiceAttachments invoiceId={inv.id} attachments={inv.attachments} />

      <InvoiceActions
        invoiceId={inv.id}
        canPushShopify={!!inv.company?.customer?.shopifyId}
        shopifyInvoiceUrl={inv.shopifyInvoiceUrl}
        depositPercent={inv.depositPercent}
        depositCents={inv.depositCents}
        balanceCents={inv.depositCents > 0 ? inv.totalCents - inv.depositCents : 0}
        fulfilledAt={
          inv.fulfilledAt ? fmtDate(inv.fulfilledAt.toISOString().slice(0, 10)) : null
        }
        balanceInvoiceUrl={inv.shopifyBalanceInvoiceUrl}
        status={inv.status}
        paidAt={
          inv.paidAt ? fmtDate(inv.paidAt.toISOString().slice(0, 10)) : null
        }
        depositPaidAt={
          inv.depositPaidAt
            ? fmtDate(inv.depositPaidAt.toISOString().slice(0, 10))
            : null
        }
        balancePaidAt={
          inv.balancePaidAt
            ? fmtDate(inv.balancePaidAt.toISOString().slice(0, 10))
            : null
        }
      />

      {inv.sourcePo ? (
        <Card className="mt-5 p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-900">Linked Production POs</h2>
            <Button
              variant="outline"
              size="sm"
              disabled
              title="This invoice already has a linked PO"
            >
              Create Linked PO
            </Button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-zinc-100 pt-3">
            <Link
              href={`/modules/production/po/${inv.sourcePo.id}`}
              className="font-mono text-sm font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
            >
              {inv.sourcePo.shopifyPoNumber}
            </Link>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/modules/production/po/${inv.sourcePo.id}`}>Open PO</Link>
            </Button>
          </div>
        </Card>
      ) : (
        <div className="mt-5">
          <h2 className="text-sm font-semibold text-zinc-900">Linked Production POs</h2>
          <p className="mb-3 mt-1 text-xs text-zinc-500">
            Prefilled from this invoice&apos;s line items (enter production costs).
            Creating it links the PO back to this invoice.
          </p>
          <PoForm
            suppliers={suppliers}
            companies={companyOptions}
            priceTiers={tiers}
            invoiceId={inv.id}
            initial={poInitial}
            submitLabel="Create Linked PO"
          />
        </div>
      )}

      {history.length > 0 && (
        <Card className="mt-5 p-6">
          <h2 className="text-sm font-semibold text-zinc-900">History</h2>
          <ol className="mt-4 space-y-3">
            {history.map((h, i) => (
              <li key={i} className="flex items-baseline gap-3 text-sm">
                <span className="w-40 shrink-0 text-xs text-zinc-400">
                  {new Date(h.at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-zinc-700">{h.label}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
