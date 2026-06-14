import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSupplierLead } from "@/lib/suppliers/lead-service";
import { PageHeader } from "@/components/ui/page-header";
import { SupplierLeadDetail } from "./supplier-lead-detail";

export const metadata: Metadata = {
  title: "Supplier Lead | Fitwell Admin",
};

export default async function SupplierLeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;
  const lead = await getSupplierLead(id);
  if (!lead) notFound();

  const title =
    [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() ||
    lead.companyName ||
    lead.email ||
    "Supplier lead";

  return (
    <div>
      <Link
        href="/modules/production/supplier-leads"
        className="text-sm text-zinc-400 hover:text-zinc-700"
      >
        &larr; Supplier Leads
      </Link>
      <div className="mt-3">
        <PageHeader title={title} />
      </div>
      <div className="mt-6">
        <SupplierLeadDetail
          lead={{
            id: lead.id,
            status: lead.status,
            supplierId: lead.supplierId,
            firstName: lead.firstName,
            lastName: lead.lastName,
            email: lead.email,
            phone: lead.phone,
            title: lead.title,
            companyName: lead.companyName,
            website: lead.website,
            addressLine1: lead.addressLine1,
            addressLine2: lead.addressLine2,
            city: lead.city,
            region: lead.region,
            postalCode: lead.postalCode,
            country: lead.country,
            supplierType: lead.supplierType,
            notes: lead.notes,
            cardImageUrl: lead.cardImageUrl,
            cardRawText: lead.cardRawText,
          }}
        />
      </div>
    </div>
  );
}
