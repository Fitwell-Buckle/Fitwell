import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { company, priceTier } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { CompaniesManager } from "./companies-manager";

export const metadata: Metadata = {
  title: "B2B Brand List | Fitwell Admin",
};

export default async function BrandsPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const [tiers, companies] = await Promise.all([
    db.query.priceTier.findMany({ orderBy: asc(priceTier.name) }),
    db.query.company.findMany({
      orderBy: asc(company.name),
      with: {
        priceTier: { columns: { name: true } },
        contacts: { columns: { id: true, email: true, name: true } },
      },
    }),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title="B2B Brand List" />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/customers">Back to Customers</Link>
        </Button>
      </div>

      <CompaniesManager
        priceTiers={tiers.map((t) => ({
          id: t.id,
          name: t.name,
          discountPercent: t.discountPercent,
        }))}
        companies={companies.map((c) => ({
          id: c.id,
          name: c.name,
          contactName: c.contactName,
          contactEmail: c.contactEmail,
          customerId: c.customerId,
          notes: c.notes,
          priceTierId: c.priceTierId,
          tierName: c.priceTier?.name ?? null,
          assignedCollectionIds: c.assignedCollectionIds ?? [],
          assignedProductIds: c.assignedProductIds ?? [],
          contacts: c.contacts.map((ct) => ({
            id: ct.id,
            email: ct.email,
            name: ct.name,
          })),
        }))}
      />
    </div>
  );
}
