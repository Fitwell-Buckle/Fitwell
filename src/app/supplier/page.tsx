import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq, or, and, inArray, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { productionPo, productionStageAssignment } from "@/lib/schema";
import { formatPoNumber } from "@/lib/production/sub-po";
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
  derivePoStage,
  terminalStage,
  type ProductionStage,
} from "@/lib/production/stages";
import { getStageLabels, getStageOrder } from "@/lib/production/stage-labels";
import {
  STATUS_LABELS,
  statusBadgeClass,
  stageBadgeClass,
  fmtDate,
} from "@/lib/production/display";
import { stagesOwnedBySupplier } from "@/lib/production/stage-owners";
import { listSupplierMissingEtas } from "@/lib/production/missing-etas";
import { cn } from "@/lib/utils";
import {
  KanbanBoard,
  type KanbanCard,
} from "@/app/(admin)/modules/production/kanban/kanban-board";
import { MissingEtaNudge } from "./missing-eta-nudge";

export default async function SupplierHomePage() {
  const scope = await getSupplierScope();
  if (!scope) redirect("/external/login");
  const me = scope.supplierId;
  const [stageLabels, order] = await Promise.all([getStageLabels(), getStageOrder()]);

  // POs this supplier is involved in: their own POs OR ones where they own a stage.
  const assigned = await db
    .select({ poId: productionStageAssignment.poId })
    .from(productionStageAssignment)
    .where(eq(productionStageAssignment.supplierId, me));
  const assignedPoIds = [...new Set(assigned.map((a) => a.poId))];

  // A supplier works the master PO (scoped to their stages); their sub-PO is the
  // sent document, not a separate work unit — so exclude sub-PO rows here.
  const involvement = assignedPoIds.length
    ? or(eq(productionPo.supplierId, me), inArray(productionPo.id, assignedPoIds))
    : eq(productionPo.supplierId, me);
  const pos = await db.query.productionPo.findMany({
    where: and(isNull(productionPo.parentPoId), involvement),
    orderBy: desc(productionPo.createdAt),
    with: {
      supplier: { columns: { name: true } },
      lineItems: {
        columns: { id: true, sku: true, title: true, quantity: true, currentStage: true },
      },
      stageAssignments: { columns: { stage: true, supplierId: true } },
    },
  });

  // This supplier's sub-PO suffix per master, so the list shows the number they
  // were actually sent (e.g. 00100-A) rather than the bare master number.
  const mySubPos = await db
    .select({ parentPoId: productionPo.parentPoId, poSuffix: productionPo.poSuffix })
    .from(productionPo)
    .where(and(eq(productionPo.supplierId, me), isNotNull(productionPo.parentPoId)));
  const suffixByMaster = new Map(
    mySubPos.map((s) => [s.parentPoId, s.poSuffix] as const),
  );

  // Board: only the stages this supplier has ACTIVE cards in, plus the
  // immediate next stage so they can drop a card forward to advance / hand
  // off. Owned-but-empty stages are hidden — a supplier who is the sole
  // primary on a standalone PO "owns" the whole pipeline by default, so
  // without this trim their board would balloon to every stage. Cards only
  // come from stages the supplier actually owns on that PO.
  const terminal = terminalStage(order);
  const cards: KanbanCard[] = [];
  const cardStages = new Set<ProductionStage>();
  // POs with line items this supplier owns that still lack a Final ETA — drives
  // the login nudge (shared with the reminder cron).
  const missingEtaPos = await listSupplierMissingEtas(me);
  for (const po of pos) {
    const owned = stagesOwnedBySupplier(
      order,
      po.stageAssignments,
      po.supplierId,
      me,
    ).filter((s) => s !== terminal);
    const ownedSet = new Set(owned);
    const poCards = po.lineItems.filter((li) => ownedSet.has(li.currentStage));
    if (poCards.length === 0) continue;
    for (const li of poCards) {
      cardStages.add(li.currentStage);
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
  // Drop-target columns: the stage immediately after each card-bearing one
  // (skip the terminal "Complete" — it has no explicit assignment).
  const dropTargets = new Set<ProductionStage>();
  for (const s of cardStages) {
    const next = order[order.indexOf(s) + 1];
    if (next && next !== terminal) dropTargets.add(next);
  }
  const boardStages = order.filter((s) => cardStages.has(s) || dropTargets.has(s));

  const rows = pos.map((po) => ({
    ...po,
    derivedStage: derivePoStage(po.lineItems.map((li) => li.currentStage)),
    itemCount: po.lineItems.length,
  }));

  return (
    <div>
      <MissingEtaNudge pos={missingEtaPos} />
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
                      <Mono>
                        {formatPoNumber(po.shopifyPoNumber, {
                          suffix: suffixByMaster.get(po.id) ?? undefined,
                        })}
                      </Mono>
                    </Link>
                  </TableCell>
                  <TableCell>
                    {po.derivedStage ? (
                      <Badge className={cn(stageBadgeClass(po.derivedStage))}>
                        {po.derivedStage === "mixed"
                          ? "Mixed"
                          : stageLabels[po.derivedStage]}
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
