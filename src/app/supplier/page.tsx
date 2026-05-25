import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq, or, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { productionPo, productionStageAssignment } from "@/lib/schema";
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
import {
  STAGES,
  STAGE_LABELS,
  derivePoStage,
  type ProductionStage,
} from "@/lib/production/stages";
import {
  STATUS_LABELS,
  statusBadgeClass,
  stageBadgeClass,
  fmtDate,
} from "@/lib/production/display";
import { stagesOwnedBySupplier } from "@/lib/production/stage-owners";
import { cn } from "@/lib/utils";
import {
  KanbanBoard,
  type KanbanCard,
} from "@/app/(admin)/modules/production/kanban/kanban-board";

export default async function SupplierHomePage() {
  const scope = await getSupplierScope();
  if (!scope) redirect("/supplier/login");
  const me = scope.supplierId;

  // POs this supplier is involved in: their own POs OR ones where they own a stage.
  const assigned = await db
    .select({ poId: productionStageAssignment.poId })
    .from(productionStageAssignment)
    .where(eq(productionStageAssignment.supplierId, me));
  const assignedPoIds = [...new Set(assigned.map((a) => a.poId))];

  const pos = await db.query.productionPo.findMany({
    where: assignedPoIds.length
      ? or(eq(productionPo.supplierId, me), inArray(productionPo.id, assignedPoIds))
      : eq(productionPo.supplierId, me),
    orderBy: desc(productionPo.createdAt),
    with: {
      supplier: { columns: { name: true } },
      lineItems: {
        columns: { id: true, sku: true, title: true, quantity: true, currentStage: true },
      },
      stageAssignments: { columns: { stage: true, supplierId: true } },
    },
  });

  // Board: only the stages this supplier owns (+ the handoff target after each),
  // and only the line items currently sitting in their owned stages.
  const ownedAll = new Set<ProductionStage>();
  const handoff = new Set<ProductionStage>();
  const cards: KanbanCard[] = [];
  for (const po of pos) {
    const owned = stagesOwnedBySupplier(po.stageAssignments, po.supplierId, me);
    const ownedSet = new Set(owned);
    for (const s of owned) {
      ownedAll.add(s);
      const next = STAGES[STAGES.indexOf(s) + 1];
      if (next && !ownedSet.has(next)) handoff.add(next);
    }
    for (const li of po.lineItems) {
      if (ownedSet.has(li.currentStage)) {
        cards.push({
          id: li.id,
          sku: li.sku,
          title: li.title,
          quantity: li.quantity,
          stage: li.currentStage,
          poId: po.id,
          poNumber: po.shopifyPoNumber,
          supplier: po.supplier?.name ?? "—",
          locked: po.lockStagesTogether,
        });
      }
    }
  }
  const boardStages = STAGES.filter((s) => ownedAll.has(s) || handoff.has(s));

  const rows = pos.map((po) => ({
    ...po,
    derivedStage: derivePoStage(po.lineItems.map((li) => li.currentStage)),
    itemCount: po.lineItems.length,
  }));

  return (
    <div>
      <PageHeader title="Your production board" />
      <p className="mt-1 text-sm text-zinc-500">
        Your stages only. Drag a card forward to advance it; dropping it into the
        next team&apos;s column hands it off and notifies Fitwell.
      </p>

      <div className="mt-5">
        {cards.length === 0 ? (
          <p className="text-sm text-zinc-400">Nothing in your stages right now.</p>
        ) : (
          <KanbanBoard cards={cards} stages={boardStages} poHrefBase="/supplier/po" />
        )}
      </div>

      <h2 className="mt-10 text-sm font-semibold text-zinc-900">Your purchase orders</h2>
      <DataTable className="mt-3">
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
