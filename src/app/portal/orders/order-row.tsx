"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Mono } from "@/components/ui/data-table";
import { TableRow, TableCell } from "@/components/ui/table";
import {
  INVOICE_STATUS_LABELS,
  invoiceStatusBadgeClass,
  type InvoiceStatus,
} from "@/lib/invoicing/invoicing";
import { fmtDate, fmtMoney } from "@/lib/production/display";
import { cn } from "@/lib/utils";

// One row of the portal orders table. The whole row opens the order (view for
// paid, edit for draft/sent); the "Pay" link stops propagation so it still
// goes straight to Shopify checkout.
export function OrderRow({
  id,
  invoiceNumber,
  issuedDate,
  status,
  totalCents,
  paymentMethod,
  shopifyInvoiceUrl,
}: {
  id: string;
  invoiceNumber: string;
  issuedDate: string;
  status: string;
  totalCents: number;
  paymentMethod: string;
  shopifyInvoiceUrl: string | null;
}) {
  const router = useRouter();
  return (
    <TableRow
      className="cursor-pointer hover:bg-zinc-50"
      onClick={() => router.push(`/portal/orders/${id}`)}
    >
      <TableCell>
        <Mono>{invoiceNumber}</Mono>
      </TableCell>
      <TableCell className="text-zinc-500">{fmtDate(issuedDate)}</TableCell>
      <TableCell>
        <Badge className={cn(invoiceStatusBadgeClass(status))}>
          {INVOICE_STATUS_LABELS[status as InvoiceStatus] ?? status}
        </Badge>
      </TableCell>
      <TableCell className="text-right font-medium text-zinc-900">
        {fmtMoney(totalCents)}
      </TableCell>
      <TableCell>
        {status === "paid" ? (
          "—"
        ) : status === "draft" ? (
          <span className="text-zinc-500">Edit draft →</span>
        ) : paymentMethod === "wire" ? (
          <span className="text-amber-700">Bank wire</span>
        ) : shopifyInvoiceUrl ? (
          <a
            href={shopifyInvoiceUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-blue-600 underline underline-offset-2"
          >
            Pay
          </a>
        ) : (
          "—"
        )}
      </TableCell>
    </TableRow>
  );
}
