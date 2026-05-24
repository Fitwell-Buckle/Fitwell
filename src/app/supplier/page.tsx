import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { productionPo } from "@/lib/schema";
import { getSupplierScope } from "@/lib/production/supplier-session";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { DataTable, Mono } from "@/components/ui/data-table";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { STAGE_LABELS, derivePoStage } from "@/lib/production/stages";
import {
  STATUS_LABELS,
  statusBadgeClass,
  stageBadgeClass,
  fmtDate,
} from "@/lib/production/display";
import { cn } from "@/lib/utils";

export default async function SupplierHomePage() {
  const scope = await getSupplierScope();
  if (!scope) redirect("/supplier/login");

  const pos = await db.query.productionPo.findMany({
    where: eq(productionPo.supplierId, scope.supplierId),
    orderBy: desc(productionPo.createdAt),
    with: { lineItems: { columns: { currentStage: true } } },
  });

  const rows = pos.map((po) => ({
    ...po,
    derivedStage: derivePoStage(po.lineItems.map((li) => li.currentStage)),
    itemCount: po.lineItems.length,
  }));

  return (
    <div>
      <PageHeader title="Your purchase orders" />

      <DataTable className="mt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO #</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Expected delivery</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-zinc-400">
                  No purchase orders yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((po) => (
                <TableRow key={po.id}>
                  <TableCell>
                    <Link
                      href={`/supplier/po/${po.id}`}
                      className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                    >
                      <Mono>{po.shopifyPoNumber}</Mono>
                    </Link>
                  </TableCell>
                  <TableCell>
                    {po.derivedStage ? (
                      <Badge className={cn(stageBadgeClass(po.derivedStage))}>
                        {po.derivedStage === "mixed"
                          ? "Mixed"
                          : STAGE_LABELS[po.derivedStage]}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn(statusBadgeClass(po.status))}>
                      {STATUS_LABELS[po.status as keyof typeof STATUS_LABELS] ??
                        po.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-500">{po.itemCount}</TableCell>
                  <TableCell className="text-zinc-500">{fmtDate(po.issuedDate)}</TableCell>
                  <TableCell className="text-zinc-500">
                    {fmtDate(po.expectedDeliveryDate)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DataTable>
    </div>
  );
}
