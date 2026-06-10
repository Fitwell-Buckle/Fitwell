import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { productionPo } from "@/lib/schema";
import { getPoDetail } from "@/lib/production/service";
import { getSupplierScope } from "@/lib/production/supplier-session";
import { getStageOrder } from "@/lib/production/stage-labels";
import { supplierHasAnyStage } from "@/lib/production/stage-owners";
import { formatPoNumber } from "@/lib/production/sub-po";
import { PageHeader } from "@/components/ui/page-header";
import { PrintablePo } from "@/components/production/printable-po";
import { PrintButton } from "@/app/(admin)/invoices/[id]/print/print-button";

// Resolve the PO this supplier may print: their own sub-PO on a master, or a
// standalone PO where they're the primary supplier. Returns null when the
// supplier reaches a master only via stage ownership (no sub-PO of their own) —
// printing the master document there would leak other suppliers' costs.
async function resolvePrintPoId(
  masterPoId: string,
  supplierId: string,
): Promise<{ printPoId: string; suffix: string | null } | null> {
  const po = await getPoDetail(masterPoId);
  if (!po) return null;
  const order = await getStageOrder();
  // Same scope gate as the supplier PO detail page.
  const inScope =
    po.supplierId === supplierId ||
    supplierHasAnyStage(order, po.stageAssignments, po.supplierId, supplierId);
  if (!inScope) return null;

  const childAny = await db.query.productionPo.findFirst({
    where: eq(productionPo.parentPoId, po.id),
    columns: { id: true },
  });
  const mySubPo = await db.query.productionPo.findFirst({
    where: and(
      eq(productionPo.parentPoId, po.id),
      eq(productionPo.supplierId, supplierId),
    ),
    columns: { id: true, poSuffix: true },
  });
  if (mySubPo) return { printPoId: mySubPo.id, suffix: mySubPo.poSuffix };
  // Master with sub-POs but none for this supplier → not theirs to print.
  if (childAny) return null;
  // Standalone PO: only the primary supplier prints the (full) document.
  if (po.supplierId !== supplierId) return null;
  return { printPoId: po.id, suffix: po.poSuffix };
}

// The page <title> becomes the browser's suggested "Save as PDF" filename,
// matching the admin send page.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const scope = await getSupplierScope();
  if (!scope) return {};
  const { id } = await params;
  const resolved = await resolvePrintPoId(id, scope.supplierId);
  if (!resolved) return {};
  const po = await db.query.productionPo.findFirst({
    where: eq(productionPo.id, resolved.printPoId),
    columns: { shopifyPoNumber: true, poSuffix: true },
  });
  const display = po
    ? formatPoNumber(po.shopifyPoNumber, { suffix: po.poSuffix })
    : "";
  return { title: { absolute: `Fitwell Purchase Order ${display}`.trim() } };
}

export default async function SupplierPrintPoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const scope = await getSupplierScope();
  if (!scope) redirect("/external/login");

  const { id } = await params;
  const resolved = await resolvePrintPoId(id, scope.supplierId);
  if (!resolved) notFound();

  const po = await db.query.productionPo.findFirst({
    where: eq(productionPo.id, resolved.printPoId),
    columns: { shopifyPoNumber: true, poSuffix: true },
  });
  const poNumberDisplay = po
    ? formatPoNumber(po.shopifyPoNumber, { suffix: po.poSuffix })
    : "";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between print:hidden">
        <PageHeader title={`Print ${poNumberDisplay}`} />
        <PrintButton />
      </div>

      {/* Same printable document admins print/email — scoped to this
          supplier's sub-PO (src/components/production/printable-po.tsx). */}
      <PrintablePo poId={resolved.printPoId} />
    </div>
  );
}
