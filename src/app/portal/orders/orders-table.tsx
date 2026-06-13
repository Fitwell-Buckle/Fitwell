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

export interface PortalOrderRow {
  id: string;
  invoiceNumber: string;
  issuedDate: string;
  status: string;
  totalCents: number;
  paymentMethod: string;
  shopifyInvoiceUrl: string | null;
}

// The B2B portal's orders table — shared by the Home page (below the order
// form) and the dedicated Orders page. Rows are clickable (see OrderRow).
export function PortalOrdersTable({ orders }: { orders: PortalOrderRow[] }) {
  return (
    <DataTable>
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
  );
}
