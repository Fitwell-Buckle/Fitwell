import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getInvoiceDetail } from "@/lib/invoicing/service";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { InvoiceForm, type InvoiceFormInitial } from "../../invoice-form";

export const metadata: Metadata = {
  title: "Edit invoice | Fitwell Admin",
};

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;
  const inv = await getInvoiceDetail(id);
  if (!inv) notFound();

  const initial: InvoiceFormInitial = {
    companyId: inv.companyId,
    companyName: inv.company?.name ?? "—",
    tierDiscount: inv.discountPercent ?? 0,
    issuedDate: inv.issuedDate,
    dueDate: inv.dueDate ?? "",
    notes: inv.notes ?? "",
    lineItems: inv.lineItems.map((l) => ({
      id: l.id,
      sku: l.sku,
      title: l.title,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      shopifyProductId: l.shopifyProductId,
      shopifyVariantId: l.shopifyVariantId,
    })),
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title={`Edit ${inv.invoiceNumber}`} />
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/invoices/${inv.id}`}>Cancel</Link>
        </Button>
      </div>
      <p className="mt-2 text-sm text-zinc-500">
        The bill-to company and its tier discount are fixed; edit dates, notes, and lines.
      </p>
      {/* companies list isn't needed in edit mode (company is read-only) */}
      <InvoiceForm companies={[]} initial={initial} invoiceId={inv.id} />
    </div>
  );
}
