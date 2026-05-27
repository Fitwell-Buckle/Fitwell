import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { company, priceTier } from "@/lib/schema";
import { getPoDetail } from "@/lib/production/service";
import { invoiceForPo } from "@/lib/invoicing/service";
import { getCatalogCached } from "@/lib/catalog/load";
import { skuSize } from "@/lib/production/display";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { InvoiceForm, type InvoiceFormInitial } from "../invoice-form";

export const metadata: Metadata = {
  title: "New invoice | Fitwell Admin",
};

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const fromPo = typeof params.fromPo === "string" ? params.fromPo : "";

  const [companies, tiers] = await Promise.all([
    db.query.company.findMany({
      columns: {
        id: true,
        name: true,
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
  ]);

  const companyOptions = companies.map((c) => ({
    id: c.id,
    name: c.name,
    tierName: c.priceTier?.name ?? null,
    tierDiscount: c.priceTier?.discountPercent ?? 0,
    assignedCollectionIds: c.assignedCollectionIds ?? [],
    assignedProductIds: c.assignedProductIds ?? [],
  }));

  // "Create invoice From PO": prefill the form from the PO's customer + lines
  // (priced at Shopify retail; the form applies the tier discount). Saving
  // creates the invoice. One invoice per PO — if one exists, go straight to it.
  let initial: InvoiceFormInitial | undefined;
  let sourcePoId = "";
  if (fromPo) {
    const existing = await invoiceForPo(fromPo);
    if (existing) redirect(`/invoices/${existing.id}`);
    const po = await getPoDetail(fromPo);
    if (po) {
      sourcePoId = fromPo;
      const catalog = await getCatalogCached().catch(() => []);
      const priceByVariant = new Map(catalog.map((v) => [v.shopifyVariantId, v.priceCents]));
      const lines = [...po.lineItems].sort(
        (a, b) => skuSize(a.sku) - skuSize(b.sku) || a.sku.localeCompare(b.sku),
      );
      initial = {
        companyId: po.companyId ?? "",
        companyName: po.company?.name ?? "",
        tierDiscount: po.company?.priceTier?.discountPercent ?? 0,
        issuedDate: new Date().toISOString().slice(0, 10),
        dueDate: "",
        notes: "",
        lineItems: lines.map((li) => ({
          id: li.id,
          sku: li.sku,
          title: li.title,
          quantity: li.quantity,
          unitPriceCents: priceByVariant.get(li.shopifyVariantId ?? "") ?? 0,
          shopifyProductId: li.shopifyProductId,
          shopifyVariantId: li.shopifyVariantId,
        })),
      };
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title={sourcePoId ? "New invoice from PO" : "New invoice"} />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/invoices">Back</Link>
        </Button>
      </div>
      <InvoiceForm
        companies={companyOptions}
        priceTiers={tiers}
        initial={initial}
        sourcePoId={sourcePoId || undefined}
      />
    </div>
  );
}
