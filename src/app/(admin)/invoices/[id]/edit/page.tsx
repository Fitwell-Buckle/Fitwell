import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { company, priceTier } from "@/lib/schema";
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

  // Fetch the bill-to company's full record + all tiers so the form can
  // render the Customer details card + Edit-customer flow on the edit page,
  // not just the new one. (The dropdown stays disabled — the bill-to company
  // is still fixed on an existing invoice; only the company's metadata is
  // editable here.)
  const [companyRow, tiers] = await Promise.all([
    db.query.company.findFirst({
      where: eq(company.id, inv.companyId),
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
      with: { priceTier: { columns: { name: true, discountPercent: true } } },
    }),
    db.query.priceTier.findMany({
      columns: { id: true, name: true, discountPercent: true },
      orderBy: asc(priceTier.name),
    }),
  ]);

  const companyOptions = companyRow
    ? [
        {
          id: companyRow.id,
          name: companyRow.name,
          contactName: companyRow.contactName,
          contactEmail: companyRow.contactEmail,
          address: companyRow.address,
          customerId: companyRow.customerId,
          priceTierId: companyRow.priceTierId,
          tierName: companyRow.priceTier?.name ?? null,
          tierDiscount: companyRow.priceTier?.discountPercent ?? 0,
          depositPercent: companyRow.depositPercent ?? 0,
          notes: companyRow.notes,
          assignedCollectionIds: companyRow.assignedCollectionIds ?? [],
          assignedProductIds: companyRow.assignedProductIds ?? [],
        },
      ]
    : [];

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
      <InvoiceForm
        companies={companyOptions}
        priceTiers={tiers}
        initial={initial}
        invoiceId={inv.id}
      />
    </div>
  );
}
