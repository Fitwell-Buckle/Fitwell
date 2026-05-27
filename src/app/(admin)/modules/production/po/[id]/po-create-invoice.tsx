import Link from "next/link";
import { Button } from "@/components/ui/button";

// Links to a new invoice prefilled from this PO (you Save it there). Once a PO
// has been invoiced, this becomes a "View invoice" link — one invoice per PO.
export function PoCreateInvoice({
  poId,
  existingInvoiceId,
}: {
  poId: string;
  existingInvoiceId?: string | null;
}) {
  if (existingInvoiceId) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href={`/invoices/${existingInvoiceId}`}>View invoice</Link>
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={`/invoices/new?fromPo=${poId}`}>Create invoice From PO</Link>
    </Button>
  );
}
