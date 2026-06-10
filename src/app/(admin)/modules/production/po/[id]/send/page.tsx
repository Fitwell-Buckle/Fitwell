import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPo, supplierContact } from "@/lib/schema";
import { getPoDetail } from "@/lib/production/service";
import { formatPoNumber } from "@/lib/production/sub-po";
import { PageHeader } from "@/components/ui/page-header";
import { PrintablePo } from "@/components/production/printable-po";
import { SendForm } from "./send-form";
import { PrintButton } from "@/app/(admin)/invoices/[id]/print/print-button";

// The page <title> is what the browser suggests as the "Save as PDF" filename,
// so name it "Fitwell Purchase Order PO-…" (mirrors the invoice pages).
// `absolute` skips any title template.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const po = await db.query.productionPo.findFirst({
    where: eq(productionPo.id, id),
    columns: { shopifyPoNumber: true, poSuffix: true },
  });
  const display = po
    ? formatPoNumber(po.shopifyPoNumber, { suffix: po.poSuffix })
    : "";
  return {
    title: { absolute: `Fitwell Purchase Order ${display}`.trim() },
  };
}

export default async function SendPoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;
  const po = await getPoDetail(id);
  if (!po) notFound();
  const poNumberDisplay = formatPoNumber(po.shopifyPoNumber, { suffix: po.poSuffix });

  // The PO is sent to the vendor (supplier).
  const defaultTo = po.supplier?.contactEmail ?? "";
  // Every other supplier contact gets auto-CC'd by the send API so the whole
  // vendor team gets the PO — surface the list in the form so the admin can
  // see who that is before hitting send.
  const supplierContacts = await db
    .select({ email: supplierContact.email })
    .from(supplierContact)
    .where(eq(supplierContact.supplierId, po.supplierId));
  const defaultToLower = defaultTo.toLowerCase();
  const autoCcEmails = Array.from(
    new Set(
      supplierContacts
        .map((r) => r.email)
        .filter((e) => e && e.toLowerCase() !== defaultToLower),
    ),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between print:hidden">
        <PageHeader title={`Send ${poNumberDisplay}`} />
        <PrintButton />
      </div>

      {/* The printable document — the same artifact suppliers print from their
          portal (src/components/production/printable-po.tsx). */}
      <PrintablePo poId={po.id} />

      <SendForm
        poId={po.id}
        defaultTo={defaultTo}
        ccEmail={session.user?.email ?? null}
        autoCcEmails={autoCcEmails}
      />
    </div>
  );
}
