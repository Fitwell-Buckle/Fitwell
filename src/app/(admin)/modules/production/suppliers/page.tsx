import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supplier } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { SupplierManager } from "./supplier-manager";

export const metadata: Metadata = {
  title: "Suppliers | Fitwell Admin",
};

export default async function SuppliersPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const suppliers = await db.query.supplier.findMany({
    orderBy: asc(supplier.name),
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title="Suppliers" />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/modules/production">Back</Link>
        </Button>
      </div>

      <SupplierManager
        suppliers={suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          contactName: s.contactName,
          contactEmail: s.contactEmail,
          notes: s.notes,
        }))}
      />
    </div>
  );
}
