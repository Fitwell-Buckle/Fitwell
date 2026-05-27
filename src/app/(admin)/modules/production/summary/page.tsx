import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ne, asc, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPo, productionStageEvent } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Mono } from "@/components/ui/data-table";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { derivePoStage } from "@/lib/production/stages";
import { getStageLabels, getStageOrder, getStages } from "@/lib/production/stage-labels";
import { supplierForStage } from "@/lib/production/stage-owners";
import { formatPoNumber } from "@/lib/production/sub-po";
import { fmtDate } from "@/lib/production/display";
import { getStageEstimates } from "@/lib/production/cycle-time-data";
import { aggregateIncoming, type IncomingLine } from "@/lib/production/inventory";
import { ListFilters } from "@/components/catalog/list-filters";
import { ProductionViewToggle } from "../view-toggle";
import { KanbanBoard, type KanbanCard } from "../kanban/kanban-board";
import { ProductionTimeline } from "../production-timeline";
import { StageSetup } from "./stage-setup";

export const metadata: Metadata = {
  title: "Production Summary | Fitwell Admin",
};

const VIEWS = ["inventory", "board", "timeline"] as const;
type View = (typeof VIEWS)[number];

export default async function ProductionSummaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const viewParam = typeof params.view === "string" ? params.view : "";
  const view: View = (VIEWS as readonly string[]).includes(viewParam)
    ? (viewParam as View)
    : "inventory";

  const supplierId = typeof params.supplier === "string" ? params.supplier : "";
  const stage = typeof params.stage === "string" ? params.stage : "";
  const status =
    typeof params.status === "string" && params.status ? params.status : "active";
  const statusFilter = status === "all" ? undefined : status;
  // Item Chooser filter: the chosen product SKU(s) (comma-separated in the URL).
  const skuSet = new Set(
    (typeof params.sku === "string" ? params.sku : "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  // Load all non-cancelled POs once. The Incoming Inventory view needs the full
  // set; the Board / Timeline views filter this in memory (small data set).
  const [allPos, suppliers, estimates, stageLabels, order, stageDefs] =
    await Promise.all([
      db.query.productionPo.findMany({
        where: ne(productionPo.status, "cancelled"),
        orderBy: desc(productionPo.createdAt),
        with: {
          supplier: { columns: { name: true } },
          stageAssignments: { columns: { stage: true, supplierId: true } },
          lineItems: {
            with: { stageEvents: { orderBy: asc(productionStageEvent.enteredAt) } },
          },
        },
      }),
      db.query.supplier.findMany({ columns: { id: true, name: true } }),
      getStageEstimates(),
      getStageLabels(),
      getStageOrder(),
      getStages(),
    ]);

  // Owning-supplier resolution: a stage can belong to a different supplier than
  // the PO's primary, and each gets a sub-PO suffix. Map supplier names + the
  // suffix per (master, supplier) so cards/bars show the responsible sub-PO.
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const suffixByMasterSupplier = new Map<string, string>();
  for (const po of allPos) {
    if (po.parentPoId && po.poSuffix) {
      suffixByMasterSupplier.set(`${po.parentPoId}:${po.supplierId}`, po.poSuffix);
    }
  }
  const lineOwner = (
    po: { id: string; supplierId: string; shopifyPoNumber: string; supplier: { name: string } | null; stageAssignments: { stage: import("@/lib/production/stages").ProductionStage; supplierId: string }[] },
    currentStage: import("@/lib/production/stages").ProductionStage,
  ): { ownerId: string; supplier: string; poNumber: string } => {
    const ownerId =
      supplierForStage(order, po.stageAssignments, po.supplierId, currentStage) ?? po.supplierId;
    const suffix = suffixByMasterSupplier.get(`${po.id}:${ownerId}`);
    return {
      ownerId,
      supplier: supplierName.get(ownerId) ?? po.supplier?.name ?? "—",
      poNumber: formatPoNumber(po.shopifyPoNumber, { suffix }),
    };
  };

  const allLines = allPos.flatMap((po) => po.lineItems);

  // How many line items currently sit in each stage — drives the editor's
  // "move stranded items" prompt when deleting a stage.
  const stageCounts: Record<string, number> = {};
  for (const li of allLines) {
    stageCounts[li.currentStage] = (stageCounts[li.currentStage] ?? 0) + 1;
  }

  // ── Incoming inventory: produced-but-not-received lines for the chosen product ──
  const incomingLines: IncomingLine[] = allLines
    .filter((li) => !li.shopifyReceivedAt && (skuSet.size === 0 || skuSet.has(li.sku)))
    .map((li) => ({
      sku: li.sku,
      title: li.title,
      quantity: li.quantity,
      currentStage: li.currentStage,
    }));
  const today = new Date().toISOString().slice(0, 10);
  const incomingRows = aggregateIncoming(order, incomingLines, estimates, today);
  const totalIncoming = incomingRows.reduce((sum, r) => sum + r.incomingQty, 0);

  // ── Board / Timeline: in-progress work, any age (a PO matches if any line
  // does). Only POs with an unfinished line item — hides completed + cancelled. ──
  // Note: the supplier filter is applied PER LINE (by the stage's owning
  // supplier), not by the master's primary — so filtering by a sub-PO supplier
  // (e.g. EPower on 00118-B) surfaces the lines they're responsible for.
  const filtered = allPos
    .filter((po) => !statusFilter || po.status === statusFilter)
    .filter((po) => po.lineItems.some((li) => li.currentStage !== order[order.length - 1]))
    .map((po) => ({
      ...po,
      derivedStage: derivePoStage(po.lineItems.map((li) => li.currentStage)),
    }))
    .filter((po) => !stage || po.derivedStage === stage)
    .filter((po) => skuSet.size === 0 || po.lineItems.some((li) => skuSet.has(li.sku)))
    // Keep POs that have at least one line owned by the filtered supplier.
    .filter(
      (po) =>
        !supplierId ||
        po.lineItems.some((li) => lineOwner(po, li.currentStage).ownerId === supplierId),
    );

  const cards: KanbanCard[] = filtered.flatMap((po) =>
    po.lineItems
      .map((li) => ({ li, owner: lineOwner(po, li.currentStage) }))
      .filter(({ owner }) => !supplierId || owner.ownerId === supplierId)
      .map(({ li, owner }) => ({
        id: li.id,
        sku: li.sku,
        title: li.title,
        quantity: li.quantity,
        stage: li.currentStage,
        poId: po.id,
        poNumber: owner.poNumber,
        supplier: owner.supplier,
        locked: po.lockStagesTogether,
      })),
  );

  // Timeline tracks carry the per-line owning supplier + sub-PO number too, and
  // honour the same per-line supplier filter.
  const timelinePos = filtered.map((po) => ({
    id: po.id,
    shopifyPoNumber: po.shopifyPoNumber,
    supplier: po.supplier,
    lineItems: po.lineItems
      .map((li) => ({ li, owner: lineOwner(po, li.currentStage) }))
      .filter(({ owner }) => !supplierId || owner.ownerId === supplierId)
      .map(({ li, owner }) => ({
        id: li.id,
        sku: li.sku,
        title: li.title,
        currentStage: li.currentStage,
        stageEvents: li.stageEvents,
        supplierName: owner.supplier,
        poNumber: owner.poNumber,
      })),
  }));

  const listFilters = (
    <ListFilters production={{ suppliers, supplierId, status, stage }} />
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Production Summary" />
        <div className="flex items-center gap-2">
          <StageSetup
            stages={stageDefs.map((s) => ({ key: s.key, label: s.label }))}
            counts={stageCounts}
          />
          <ProductionViewToggle view={view} />
        </div>
      </div>

      {view === "inventory" && (
        <>
          {listFilters}
          <div className="mt-6">
            <p className="text-sm text-zinc-500">
              Units in production that haven&apos;t been received into Shopify
              yet, by SKU. ETA is projected from cycle-time estimates.
            </p>
            <DataTable className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Incoming</TableHead>
                    <TableHead>By stage</TableHead>
                    <TableHead>Nearest ETA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incomingRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-zinc-400">
                        Nothing in production matches.
                      </TableCell>
                    </TableRow>
                  ) : (
                    incomingRows.map((r) => (
                      <TableRow key={r.sku}>
                        <TableCell className="whitespace-nowrap">
                          <Mono>{r.sku}</Mono>
                        </TableCell>
                        <TableCell className="text-zinc-700">{r.title}</TableCell>
                        <TableCell className="text-right font-medium text-zinc-900">
                          {r.incomingQty}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(r.byStage).map(([stg, qty]) => (
                              <span
                                key={stg}
                                className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600"
                              >
                                {stageLabels[stg as keyof typeof stageLabels]}: {qty}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-zinc-500">{fmtDate(r.nearestEta)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </DataTable>
            {incomingRows.length > 0 && (
              <p className="mt-3 text-right text-sm text-zinc-500">
                Total incoming units:{" "}
                <span className="font-medium text-zinc-900">{totalIncoming}</span>
              </p>
            )}
          </div>
        </>
      )}

      {view === "board" && (
        <>
          {listFilters}
          <div className="mt-6">
            {cards.length === 0 ? (
              <p className="text-sm text-zinc-400">No line items match.</p>
            ) : (
              <KanbanBoard cards={cards} stages={order} />
            )}
          </div>
        </>
      )}

      {view === "timeline" && (
        <>
          {listFilters}
          <ProductionTimeline pos={timelinePos} estimates={estimates} stageLabels={stageLabels} order={order} />
        </>
      )}
    </div>
  );
}
