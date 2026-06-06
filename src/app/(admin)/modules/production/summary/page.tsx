import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ne, asc, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPo, productionStageEvent } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
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
import { derivePoStage, type ProductionStage } from "@/lib/production/stages";
import { getStageLabels, getStageOrder } from "@/lib/production/stage-labels";
import { supplierForStage } from "@/lib/production/stage-owners";
import { formatPoNumber } from "@/lib/production/sub-po";
import {
  STATUS_LABELS,
  statusBadgeClass,
  stageBadgeClass,
  fmtDate,
} from "@/lib/production/display";
import { cn } from "@/lib/utils";
import { parseDateRange } from "@/lib/date-range";
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
  title: "Production | Fitwell Admin",
};

const VIEWS = ["inventory", "board", "timeline"] as const;
type View = (typeof VIEWS)[number];

// Group dimension. "master" = one row per master PO (PO-list parity);
// "po" = one row per sub-PO (in-flight inventory); "sku" = per-product line.
// Board and Timeline visualisations only have po/sku shapes — master falls
// through to "po" for those views (URL keeps `group=master` so the toggle
// shows the right active state when you switch back to Inventory).
const GROUPS = ["master", "po", "sku"] as const;
type Group = (typeof GROUPS)[number];

export default async function ProductionPage({
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

  const groupParam = typeof params.group === "string" ? params.group : "";
  const group: Group = (GROUPS as readonly string[]).includes(groupParam)
    ? (groupParam as Group)
    : "po";

  const supplierId = typeof params.supplier === "string" ? params.supplier : "";
  const stage = typeof params.stage === "string" ? params.stage : "";
  // Default to Open (active). `status=all` surfaces fulfilled/cancelled rows —
  // this is how the old "Purchase Orders" page's history view lives here now.
  const status =
    typeof params.status === "string" && params.status ? params.status : "active";
  const statusFilter = status === "all" ? undefined : status;
  const skuSet = new Set(
    (typeof params.sku === "string" ? params.sku : "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  // Issued-date range. The top-bar DateRangePicker writes `from`/`to`; we honour
  // them on master + po groupings. SKU grouping is per-product so the date filter
  // doesn't change its shape — leave it open across the entire incoming pipeline.
  const { from, to } = parseDateRange(params);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  const dateFiltered = (issued: string) => issued >= fromStr && issued <= toStr;

  const [allPos, suppliers, estimates, stageLabels, order] = await Promise.all([
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
    po: { id: string; supplierId: string; shopifyPoNumber: string; supplier: { name: string } | null; stageAssignments: { stage: ProductionStage; supplierId: string }[] },
    currentStage: ProductionStage,
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

  // ── Master grouping (PO-list parity) ────────────────────────────────────
  // One row per master PO. Sub-POs roll up into a `N/M sent` counter against
  // their parent. Honours the date range on issued date.
  const masterRows = (() => {
    const masters = allPos.filter((p) => !p.parentPoId);
    const childrenByMaster = new Map<string, typeof allPos>();
    for (const p of allPos) {
      if (!p.parentPoId) continue;
      const arr = childrenByMaster.get(p.parentPoId) ?? [];
      arr.push(p);
      childrenByMaster.set(p.parentPoId, arr);
    }
    return masters
      .map((po) => {
        const children = childrenByMaster.get(po.id) ?? [];
        const isMaster = children.length > 0;
        const sent = children.filter((c) => c.sentAt).length;
        return {
          po,
          isMaster,
          derivedStage: derivePoStage(po.lineItems.map((li) => li.currentStage)),
          qtyTotal: po.lineItems.reduce((s, li) => s + li.quantity, 0),
          skuList: po.lineItems.map((li) => li.sku).join(", "),
          sentCount: isMaster ? sent : po.sentAt ? 1 : 0,
          sentTotal: isMaster ? children.length : 1,
        };
      })
      .filter((r) => !statusFilter || r.po.status === statusFilter)
      .filter((r) => !supplierId || r.po.supplierId === supplierId)
      .filter((r) => !stage || r.derivedStage === stage)
      .filter((r) => skuSet.size === 0 || r.po.lineItems.some((li) => skuSet.has(li.sku)))
      .filter((r) => dateFiltered(r.po.issuedDate));
  })();

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
    .filter(
      (po) =>
        !supplierId ||
        po.lineItems.some((li) => lineOwner(po, li.currentStage).ownerId === supplierId),
    )
    .filter((po) => dateFiltered(po.issuedDate));

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

  const skuRowsByPo: Record<string, ReturnType<typeof aggregateIncoming>> = {};
  for (const poRow of incomingPoRows) {
    const lines = incomingPoLines
      .filter((l) => l.poNumber === poRow.poNumber)
      .map((l) => ({ sku: l.sku, title: l.title, quantity: l.quantity, currentStage: l.currentStage }));
    skuRowsByPo[poRow.poNumber] = aggregateIncoming(order, lines, estimates, today);
  }

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

  // Board / Timeline have no master rollup yet → fall through to po for the
  // visualisation. The toggle still shows the URL state so the user sees what's
  // selected and can switch back to Inventory to see the master grid.
  const renderGroup: "po" | "sku" = group === "sku" ? "sku" : "po";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Production" />
        <div className="flex flex-wrap items-center gap-2">
          <ProductionGroupToggle group={group} />
          <ProductionViewToggle view={view} />
          <Button asChild>
            <Link href="/modules/production/po/new">New PO</Link>
          </Button>
        </div>
      </div>

      {/* The selected view sits on a slightly-whiter panel than the page bg
          (#fafafa). The view tabs above render a white "tab leg" beneath the
          active option that visually merges with this panel. Same `shadow-sm`
          as the active tab pill, so the whole "tab + panel" reads as one
          raised surface. */}
      <div className="mt-4 rounded-xl bg-white p-4 shadow-sm md:p-6">

      {view === "inventory" && (
        <>
          {listFilters}

          {group === "master" ? (
            <DataTable className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO #</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>SKUs</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Expected delivery</TableHead>
                    <TableHead>Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {masterRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-8 text-center text-zinc-400">
                        No POs match. Create one to start tracking.
                      </TableCell>
                    </TableRow>
                  ) : (
                    masterRows.map(({ po, isMaster, derivedStage, qtyTotal, skuList, sentCount, sentTotal }) => (
                      <TableRow key={po.id}>
                        <TableCell>
                          <Link
                            href={`/modules/production/po/${po.id}`}
                            className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                          >
                            <Mono>{formatPoNumber(po.shopifyPoNumber, { isMaster })}</Mono>
                          </Link>
                        </TableCell>
                        <TableCell>
                          {isMaster ? "Multiple suppliers" : po.supplier?.name ?? "—"}
                        </TableCell>
                        <TableCell>
                          {derivedStage ? (
                            <Badge className={cn(stageBadgeClass(derivedStage))}>
                              {derivedStage === "mixed" ? "Mixed" : stageLabels[derivedStage]}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn(statusBadgeClass(po.status))}>
                            {STATUS_LABELS[po.status as keyof typeof STATUS_LABELS] ?? po.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-zinc-500">{qtyTotal}</TableCell>
                        <TableCell
                          className="max-w-xs font-mono text-xs text-zinc-500"
                          title={skuList}
                        >
                          <div className="truncate">{skuList || "—"}</div>
                        </TableCell>
                        <TableCell className="text-zinc-500">{fmtDate(po.issuedDate)}</TableCell>
                        <TableCell className="text-zinc-500">{fmtDate(po.expectedDeliveryDate)}</TableCell>
                        <TableCell>
                          {isMaster ? (
                            <span
                              className={cn(
                                "text-xs",
                                sentTotal > 0 && sentCount === sentTotal
                                  ? "font-medium text-emerald-700"
                                  : "text-zinc-400",
                              )}
                            >
                              {sentCount}/{sentTotal} sent
                            </span>
                          ) : po.sentAt ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              Sent ✓
                            </span>
                          ) : (
                            <span className="text-zinc-300">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </DataTable>
          ) : (
            <div className="mt-6">
              <p className="text-sm text-zinc-500">
                Units in production that haven&apos;t been received into Shopify
                yet, {group === "po" ? "by PO" : "by SKU"}. ETA is projected from
                cycle-time estimates.
              </p>

              {group === "po" ? (
                <div className="mt-4">
                  <PoExpandableList
                    rows={incomingPoRows}
                    skuRowsByPo={skuRowsByPo}
                    stageLabels={stageLabels}
                  />
                </div>
              ) : (
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
          )}
        </>
      )}

      {view === "board" && (
        <>
          {listFilters}
          <div className="mt-6">
            {renderGroup === "po" ? (
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
          {renderGroup === "po" ? (
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
    </div>
  );
}
