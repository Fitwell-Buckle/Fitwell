import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supplier } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { InboundMessages } from "@/components/crm/inbound-messages";
import { SupplierDetailView } from "./supplier-detail-view";

export const metadata: Metadata = {
  title: "Supplier | Fitwell Admin",
};

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;
  const supplierRow = await db.query.supplier.findFirst({
    where: eq(supplier.id, id),
    with: { contacts: { columns: { id: true, email: true, name: true } } },
  });
  if (!supplierRow) notFound();

  return (
    <div>
      <PageHeader title={supplierRow.name} />
      <SupplierDetailView
        supplier={{
          id: supplierRow.id,
          name: supplierRow.name,
          contactName: supplierRow.contactName,
          contactEmail: supplierRow.contactEmail,
          phone: supplierRow.phone,
          shippingAddress: supplierRow.shippingAddress,
          notes: supplierRow.notes,
        }}
        contacts={supplierRow.contacts.map((c) => ({
          id: c.id,
          email: c.email,
          name: c.name,
        }))}
      />

      <InboundMessages
        emails={[
          supplierRow.contactEmail,
          ...supplierRow.contacts.map((c) => c.email),
        ].filter((e): e is string => Boolean(e))}
        relationship="supplier"
        whatsapp={{ type: "supplier", id: supplierRow.id }}
      />
    </div>
  );
}
