import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supplier, company } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { PoForm } from "./po-form";

export const metadata: Metadata = {
  title: "New Production PO | Fitwell Admin",
};

export default async function NewPoPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const [suppliers, companies] = await Promise.all([
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

      {suppliers.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">
          Add a supplier first on the{" "}
          <Link
            href="/modules/production/suppliers"
            className="underline underline-offset-2"
          >
            Suppliers
          </Link>{" "}
          page.
        </p>
      ) : (
        <PoForm suppliers={suppliers} companies={companyOptions} />
      )}
    </div>
  );
}
