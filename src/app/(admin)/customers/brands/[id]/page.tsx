import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { company, priceTier } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { CustomerDetailView } from "./customer-detail-view";

export const metadata: Metadata = {
  title: "B2B customer | Fitwell Admin",
};

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;
  const [companyRow, tiers] = await Promise.all([
    db.query.company.findFirst({
      where: eq(company.id, id),
      with: {
        priceTier: { columns: { name: true, discountPercent: true } },
        contacts: { columns: { id: true, email: true, name: true } },
      },
    }),
    db.query.priceTier.findMany({
      columns: { id: true, name: true, discountPercent: true },
      orderBy: asc(priceTier.name),
    }),
  ]);
  if (!companyRow) notFound();

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <PageHeader title={companyRow.name} />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/customers/brands">Back</Link>
        </Button>
      </div>
      <CustomerDetailView
        customer={{
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
        }}
        contacts={companyRow.contacts.map((c) => ({
          id: c.id,
          email: c.email,
          name: c.name,
        }))}
        priceTiers={tiers}
      />
    </div>
  );
}
