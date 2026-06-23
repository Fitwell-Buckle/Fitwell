import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { prototype, supplier } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { InboundMessages } from "@/components/crm/inbound-messages";
import { PrototypeStatusBadge } from "../../prototypes/prototype-manager";
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
  const [supplierRow, prototypes] = await Promise.all([
    db.query.supplier.findFirst({
      where: eq(supplier.id, id),
      with: { contacts: { columns: { id: true, email: true, name: true } } },
    }),
    db.query.prototype.findMany({
      where: eq(prototype.supplierId, id),
      orderBy: desc(prototype.updatedAt),
      columns: {
        id: true,
        name: true,
        proposedSku: true,
        finalSku: true,
        status: true,
      },
    }),
  ]);
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

      <Card className="mt-5 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Prototypes</h2>
          <Link
            href="/modules/production/prototypes"
            className="text-sm text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
          >
            All prototypes
          </Link>
        </div>
        <div className="mt-3 space-y-2">
          {prototypes.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No prototypes with this vendor yet.
            </p>
          ) : (
            prototypes.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-md border border-zinc-100 px-3 py-2"
              >
                <Link
                  href={`/modules/production/prototypes/${p.id}`}
                  className="min-w-0 truncate text-sm font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                >
                  {p.name}
                </Link>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-zinc-500">
                    {p.finalSku ?? p.proposedSku ?? "—"}
                  </span>
                  <PrototypeStatusBadge status={p.status} />
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

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
