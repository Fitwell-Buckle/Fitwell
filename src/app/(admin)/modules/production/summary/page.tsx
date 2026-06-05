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
import { derivePoStage, type ProductionStage } from "@/lib/production/stages";
import { getStageLabels, getStageOrder } from "@/lib/production/stage-labels";
import { supplierForStage } from "@/lib/production/stage-owners";
import { formatPoNumber } from "@/lib/production/sub-po";
import { fmtDate } from "@/lib/production/display";
import { getStageEstimates } from "@/lib/production/cycle-time-data";
import {
  aggregateIncoming,
  aggregateIncomingByPo,
  type IncomingLine,
  type IncomingPoLine,
} from "@/lib/production/inventory";
import { ListFilters } from "@/components/catalog/list-filters";
import { ProductionViewToggle } from "../view-toggle";
import { ProductionGroupToggle } from "../group-toggle";
import { KanbanBoard, type KanbanCard } from "../kanban/kanban-board";
import { ProductionTimeline } from "../production-timeline";
import { PoExpandableList } from "../po-expandable-list";
import { PoExpandableBoard } from "../po-expandable-board";
import { PoExpandableTimeline } from "../po-expandable-timeline";

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
  // Grouping dimension for every view: "po" (default) or "sku" (per line item).
  // Drill-downs are now client-side in-place (no URL navigation needed).
  const group: "sku" | "po" = params.group === "sku" ? "sku" : "po";

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
  const [allPos, suppliers, estimates, stageLabels, order] =
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

  // ── "By PO" variants (group === "po"): aggregate to one row/card/track per
  // owning sub-PO instead of per SKU/line. ───────────────────────────────────

  // Inventory: incoming units grouped by owning sub-PO.
  const incomingPoLines: IncomingPoLine[] = allPos.flatMap((po) =>
    po.lineItems
      .filter((li) => !li.shopifyReceivedAt && (skuSet.size === 0 || skuSet.has(li.sku)))
      .map((li) => {
        const owner = lineOwner(po, li.currentStage);
        return {
          sku: li.sku,
          title: li.title,
          quantity: li.quantity,
          currentStage: li.currentStage,
          poNumber: owner.poNumber,
          poId: po.id,
          supplier: owner.supplier,
        };
      }),
  );
  const incomingPoRows = aggregateIncomingByPo(order, incomingPoLines, estimates, today);

  // Pre-compute per-PO SKU breakdowns server-side so client components don't
  // need to re-import aggregation helpers or receive raw line data.
  const skuRowsByPo: Record<string, ReturnType<typeof aggregateIncoming>> = {};
  for (const poRow of incomingPoRows) {
    const lines = incomingPoLines
      .filter((l) => l.poNumber === poRow.poNumber)
      .map((l) => ({ sku: l.sku, title: l.title, quantity: l.quantity, currentStage: l.currentStage }));
    skuRowsByPo[poRow.poNumber] = aggregateIncoming(order, lines, estimates, today);
  }

  // Board: one (non-draggable) card per sub-PO, placed in the column of its
  // least-advanced open line (where the PO is currently gated).
  const poCardMap = new Map<string, KanbanCard>();
  for (const c of cards) {
    const ex = poCardMap.get(c.poNumber);
    if (!ex) {
      poCardMap.set(c.poNumber, {
        ...c,
        id: c.poNumber,
        sku: c.poNumber,
        title: c.supplier,
        locked: false,
      });
    } else {
      ex.quantity += c.quantity;
      if (order.indexOf(c.stage) < order.indexOf(ex.stage)) ex.stage = c.stage;
    }
  }
  const poCards = [...poCardMap.values()];

  // Timeline: one synthetic track per sub-PO. Merge its lines' stage events
  // (per stage: earliest entry, latest exit — null exit if any line is still in
  // that stage) and use the least-advanced open stage as the PO's current stage.
  const poTrackMap = new Map<
    string,
    {
      poId: string;
      poNumber: string;
      supplier: string;
      currentStage: ProductionStage;
      events: Map<string, { enteredAt: Date; exitedAt: Date | null }>;
    }
  >();
  for (const po of timelinePos) {
    for (const li of po.lineItems) {
      const key = li.poNumber;
      const g =
        poTrackMap.get(key) ??
        {
          poId: po.id,
          poNumber: key,
          supplier: li.supplierName,
          currentStage: li.currentStage,
          events: new Map<string, { enteredAt: Date; exitedAt: Date | null }>(),
        };
      if (order.indexOf(li.currentStage) < order.indexOf(g.currentStage)) {
        g.currentStage = li.currentStage;
      }
      for (const ev of li.stageEvents) {
        const e = g.events.get(ev.stage);
        if (!e) {
          g.events.set(ev.stage, { enteredAt: ev.enteredAt, exitedAt: ev.exitedAt });
        } else {
          if (ev.enteredAt < e.enteredAt) e.enteredAt = ev.enteredAt;
          e.exitedAt =
            e.exitedAt && ev.exitedAt
              ? ev.exitedAt > e.exitedAt
                ? ev.exitedAt
                : e.exitedAt
              : null;
        }
      }
      poTrackMap.set(key, g);
    }
  }
  const timelinePosByPo = [...poTrackMap.values()].map((g) => ({
    id: g.poId,
    shopifyPoNumber: g.poNumber,
    supplier: { name: g.supplier },
    lineItems: [
      {
        id: g.poNumber,
        sku: g.poNumber,
        title: g.supplier,
        currentStage: g.currentStage,
        supplierName: g.supplier,
        poNumber: g.poNumber,
        stageEvents: [...g.events.entries()]
          .map(([stage, e]) => ({
            id: `${g.poNumber}-${stage}`,
            stage: stage as ProductionStage,
            enteredAt: e.enteredAt,
            exitedAt: e.exitedAt,
          }))
          .sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime()),
      },
    ],
  }));

  const listFilters = (
    <ListFilters production={{ suppliers, supplierId, status, stage }} />
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Production Summary" />
        <div className="flex flex-wrap items-center gap-2">
          <ProductionGroupToggle group={group} />
          <ProductionViewToggle view={view} />
        </div>
      </div>

      {view === "inventory" && (
        <>
          {listFilters}
          <div className="mt-6">
            <p className="text-sm text-zinc-500">
              Units in production that haven&apos;t been received into Shopify
              yet, {group === "po" ? "by PO" : "by SKU"}. ETA is projected from
              cycle-time estimates.
            </p>

            {group === "po" ? (
              /* Fully client-side expandable list — click a row to expand SKUs inline */
              <div className="mt-4">
                <PoExpandableList
                  rows={incomingPoRows}
                  skuRowsByPo={skuRowsByPo}
                  stageLabels={stageLabels}
                />
              </div>
            ) : (
              /* By SKU: static server-rendered table */
              <>
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
                {totalIncoming > 0 && (
                  <p className="mt-3 text-right text-sm text-zinc-500">
                    Total incoming units:{" "}
                    <span className="font-medium text-zinc-900">{totalIncoming}</span>
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}

      {view === "board" && (
        <>
          {listFilters}
          <div className="mt-6">
            {group === "po" ? (
              poCards.length === 0 ? (
                <p className="text-sm text-zinc-400">No POs match.</p>
              ) : (
                <PoExpandableBoard
                  cards={poCards}
                  stages={order}
                  skuRowsByPo={skuRowsByPo}
                  stageLabels={stageLabels}
                />
              )
            ) : cards.length === 0 ? (
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
          {group === "po" ? (
            <PoExpandableTimeline
              pos={timelinePosByPo}
              estimates={estimates}
              stageLabels={stageLabels}
              order={order}
              skuRowsByPo={skuRowsByPo}
            />
          ) : (
            <ProductionTimeline
              pos={timelinePos}
              estimates={estimates}
              stageLabels={stageLabels}
              order={order}
            />
          )}
        </>
      )}
    </div>
  );
}
