import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supplier, company } from "@/lib/schema";
import { getPoDetail } from "@/lib/production/service";
import { skuSize } from "@/lib/production/display";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { PoForm, type PoFormInitial } from "../../new/po-form";

export const metadata: Metadata = {
  title: "Edit Production PO | Fitwell Admin",
};

export default async function EditPoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;
  const [po, suppliers, companies] = await Promise.all([
    getPoDetail(id),
    db.query.supplier.findMany({
      columns: { id: true, name: true },
      orderBy: asc(supplier.name),
    }),
    db.query.company.findMany({
      columns: { id: true, name: true },
      orderBy: asc(company.name),
      with: { priceTier: { columns: { name: true, discountPercent: true } } },
    }),
  ]);
  if (!po) notFound();

  const companyOptions = companies.map((c) => ({
    id: c.id,
    name: c.name,
    tierName: c.priceTier?.name ?? null,
    tierDiscount: c.priceTier?.discountPercent ?? null,
  }));

  const initial: PoFormInitial = {
    supplierId: po.supplierId,
    shopifyPoNumber: po.shopifyPoNumber,
    issuedDate: po.issuedDate,
    expectedDeliveryDate: po.expectedDeliveryDate ?? "",
    notes: po.notes ?? "",
    companyId: po.companyId ?? "",
    shopifyLocationId: po.shopifyLocationId ?? "",
    locationName: po.locationName ?? "",
    lineItems: [...po.lineItems]
      .sort((a, b) => skuSize(a.sku) - skuSize(b.sku) || a.sku.localeCompare(b.sku))
      .map((li) => ({
        id: li.id,
        sku: li.sku,
        title: li.title,
        quantity: li.quantity,
        unitCostCents: li.unitCostCents,
        shopifyProductId: li.shopifyProductId,
        shopifyVariantId: li.shopifyVariantId,
        companyId: li.companyId,
        shopifyLocationId: li.shopifyLocationId,
        locationName: li.locationName,
      })),
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title={`Edit PO ${po.shopifyPoNumber}`} />
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/modules/production/po/${po.id}`}>Cancel</Link>
        </Button>
      </div>

      <p className="mt-2 text-sm text-zinc-500">
        Removing a line deletes its stage history. New lines start at Supplier PO.
        Stage and status are managed on the PO page.
      </p>

      <PoForm
        suppliers={suppliers}
        companies={companyOptions}
        initial={initial}
        poId={po.id}
      />
    </div>
  );
}
