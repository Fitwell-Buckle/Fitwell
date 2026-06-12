import { redirect } from "next/navigation";
import { getCompanyScope } from "@/lib/portal/company-session";
import { listInvoicesForCompany } from "@/lib/invoicing/service";
import {
  INVOICE_STATUS_LABELS,
  invoiceStatusBadgeClass,
  type InvoiceStatus,
} from "@/lib/invoicing/invoicing";
import { fmtDate, fmtMoney } from "@/lib/production/display";
import { PageHeader } from "@/components/ui/page-header";
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

export default async function PortalOrdersPage() {
  const scope = await getCompanyScope();
  if (!scope) redirect("/portal/login");

  const orders = await listInvoicesForCompany(scope.companyId);

  return (
    <div>
      <PageHeader title="Your orders" />

      <DataTable className="mt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Pay</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-zinc-400">
                  No orders yet.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Mono>{o.invoiceNumber}</Mono>
                  </TableCell>
                  <TableCell className="text-zinc-500">{fmtDate(o.issuedDate)}</TableCell>
                  <TableCell>
                    <Badge className={cn(invoiceStatusBadgeClass(o.status))}>
                      {INVOICE_STATUS_LABELS[o.status as InvoiceStatus] ?? o.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium text-zinc-900">
                    {fmtMoney(o.totalCents)}
                  </TableCell>
                  <TableCell>
                    {o.status === "paid" ? (
                      "—"
                    ) : o.paymentMethod === "wire" ? (
                      <span className="text-amber-700">Bank wire</span>
                    ) : o.shopifyInvoiceUrl ? (
                      <a
                        href={o.shopifyInvoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 underline underline-offset-2"
                      >
                        Pay
                      </a>
                    ) : (
                      "—"
                    )}
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
