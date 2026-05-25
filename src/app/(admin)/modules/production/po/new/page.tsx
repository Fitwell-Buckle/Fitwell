import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supplier, company, priceTier } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { PoForm } from "./po-form";

export const metadata: Metadata = {
  title: "New Production PO | Fitwell Admin",
};

export default async function NewPoPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const [suppliers, companies, tiers] = await Promise.all([
    db.query.supplier.findMany({
      columns: { id: true, name: true },
      orderBy: asc(supplier.name),
    }),
    db.query.company.findMany({
      columns: { id: true, name: true },
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
    tierDiscount: c.priceTier?.discountPercent ?? null,
  }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title="New Production PO" />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/modules/production">Cancel</Link>
        </Button>
      </div>

      <PoForm suppliers={suppliers} companies={companyOptions} priceTiers={tiers} />
    </div>
  );
}
