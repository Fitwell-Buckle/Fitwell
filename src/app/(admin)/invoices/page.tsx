import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { listInvoices } from "@/lib/invoicing/service";
import {
  INVOICE_STATUS_LABELS,
  invoiceStatusBadgeClass,
  type InvoiceStatus,
} from "@/lib/invoicing/invoicing";
import { fmtDate, fmtMoney } from "@/lib/production/display";
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
  title: "Invoices | Fitwell Admin",
};

export default async function InvoicesPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const invoices = await listInvoices();

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title="Invoices" />
        <Button asChild>
          <Link href="/invoices/new">New invoice</Link>
        </Button>
      </div>

      <DataTable className="mt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-zinc-400">
                  No invoices yet.
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                    >
                      <Mono>{inv.invoiceNumber}</Mono>
                    </Link>
                  </TableCell>
                  <TableCell className="text-zinc-700">{inv.company?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge className={cn(invoiceStatusBadgeClass(inv.status))}>
                      {INVOICE_STATUS_LABELS[inv.status as InvoiceStatus] ?? inv.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-500">{fmtDate(inv.issuedDate)}</TableCell>
                  <TableCell className="text-zinc-500">{fmtDate(inv.dueDate)}</TableCell>
                  <TableCell className="text-right font-medium text-zinc-900">
                    {fmtMoney(inv.totalCents)}
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
