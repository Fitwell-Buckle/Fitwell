import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { company, priceTier } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { InvoiceForm } from "../invoice-form";

export const metadata: Metadata = {
  title: "New invoice | Fitwell Admin",
};

export default async function NewInvoicePage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

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

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title="New invoice" />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/invoices">Back</Link>
        </Button>
      </div>
      <InvoiceForm companies={companyOptions} priceTiers={tiers} />
    </div>
  );
}
