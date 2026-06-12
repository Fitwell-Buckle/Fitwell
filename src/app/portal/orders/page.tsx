import { redirect } from "next/navigation";
import { getCompanyScope } from "@/lib/portal/company-session";
import { listInvoicesForCompany } from "@/lib/invoicing/service";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { OrderRow } from "./order-row";

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
                <OrderRow
                  key={o.id}
                  id={o.id}
                  invoiceNumber={o.invoiceNumber}
                  issuedDate={o.issuedDate}
                  status={o.status}
                  totalCents={o.totalCents}
                  paymentMethod={o.paymentMethod}
                  shopifyInvoiceUrl={o.shopifyInvoiceUrl}
                />
              ))
            )}
          </TableBody>
        </Table>
      </DataTable>
    </div>
  );
}
