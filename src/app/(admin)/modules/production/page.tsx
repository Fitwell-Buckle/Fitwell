import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ne, asc, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPo, productionStageEvent } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { parseDateRange } from "@/lib/date-range";
import { getStageEstimates } from "@/lib/production/cycle-time-data";
import { projectEta } from "@/lib/production/cycle-time";
import {
  buildLineSegments,
  isoDay,
  utcMidnight,
} from "@/lib/production/timeline-segments";
import {
  aggregateIncoming,
  type IncomingLine,
  type IncomingPoRow,
} from "@/lib/production/inventory";
import { ListFilters } from "@/components/catalog/list-filters";
import { ProductionViewToggle } from "./view-toggle";
import { ProductionGroupToggle } from "./group-toggle";
import { KanbanBoard, type KanbanCard } from "./kanban/kanban-board";
import { ProductionTimeline } from "@/components/production/production-timeline";
import { PoExpandableList } from "./po-expandable-list";
import { PoExpandableBoard } from "./po-expandable-board";
import { PoExpandableTimeline } from "./po-expandable-timeline";

export const metadata: Metadata = {
  title: "POs & Production | Fitwell Admin",
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
    : "master";

  const supplierId = typeof params.supplier === "string" ? params.supplier : "";
  const stage = typeof params.stage === "string" ? params.stage : "";
  // Default to Open (active). `status=all` surfaces fulfilled/cancelled rows —
  // covers the PO-history use case that used to live on a separate page.
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
        stageEtas: { columns: { stage: true, targetEndDate: true } },
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

  const allLines = allPos.flatMap((po) => po.lineItems);
  const today = new Date().toISOString().slice(0, 10);

  // Master→child-count lookup used by both Sub-PO grouping (to skip masters
  // that are represented by their children) and Master grouping (to render
  // the "Multiple suppliers" label + N/M sent chip).
  const childCountByMaster = new Map<string, number>();
  for (const p of allPos) {
    if (!p.parentPoId) continue;
    childCountByMaster.set(p.parentPoId, (childCountByMaster.get(p.parentPoId) ?? 0) + 1);
  }
  const masterById = new Map(
    allPos.filter((p) => !p.parentPoId).map((p) => [p.id, p]),
  );

  // ── Master grouping ────────────────────────────────────────────────────
  // One row per master PO. Per-row data follows the canonical 6-col shape
  // shared with Sub-PO/SKU: incoming qty (units not yet received), per-stage
  // breakdown, nearest projected ETA, status badge — so the three groupings
  // read as the same table with different identifiers. Sub-PO send progress
  // (N/M sent) lives as a small chip under the PO# cell.
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
        // In-flight aggregation across this master's own line items (sub-POs
        // route stages but don't own line items in the schema).
        const incomingLis = po.lineItems.filter((li) => !li.shopifyReceivedAt);
        const byStage: Partial<Record<ProductionStage, number>> = {};
        let nearestEta: string | null = null;
        for (const li of incomingLis) {
          byStage[li.currentStage] = (byStage[li.currentStage] ?? 0) + li.quantity;
          const eta = projectEta(order, li.currentStage, today, estimates);
          if (nearestEta === null || eta < nearestEta) nearestEta = eta;
        }
        return {
          po,
          isMaster,
          derivedStage: derivePoStage(po.lineItems.map((li) => li.currentStage)),
          incomingQty: incomingLis.reduce((s, li) => s + li.quantity, 0),
          byStage,
          nearestEta,
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

  // Map Master rows into PoExpandableList's row shape so the Inventory Master
  // view gets the same inline cascade-down animation Sub-PO uses. SKU drill
  // data is computed off the same set so every master row has a key. The
  // `sent` chip lives in `masterSubtitles` (rendered under the PO# cell).
  const incomingMasterRows: IncomingPoRow[] = masterRows.map(
    ({ po, isMaster, incomingQty, byStage, nearestEta }) => ({
      poNumber: formatPoNumber(po.shopifyPoNumber, { isMaster }),
      poId: po.id,
      supplier: isMaster ? "Multiple suppliers" : po.supplier?.name ?? "—",
      status: po.status,
      incomingQty,
      byStage,
      nearestEta,
    }),
  );
  const skuRowsByMasterRow: Record<string, ReturnType<typeof aggregateIncoming>> = {};
  const masterSubtitles: Record<string, React.ReactNode> = {};
  for (const { po, isMaster, sentCount, sentTotal } of masterRows) {
    const number = formatPoNumber(po.shopifyPoNumber, { isMaster });
    const lines = po.lineItems
      .filter((li) => !li.shopifyReceivedAt && (skuSet.size === 0 || skuSet.has(li.sku)))
      .map((li) => ({
        sku: li.sku,
        title: li.title,
        quantity: li.quantity,
        currentStage: li.currentStage,
      }));
    skuRowsByMasterRow[number] = aggregateIncoming(order, lines, estimates, today);
    if (isMaster) {
      const allSent = sentTotal > 0 && sentCount === sentTotal;
      masterSubtitles[number] = (
        <span className={allSent ? "font-medium text-emerald-700" : undefined}>
          {sentCount}/{sentTotal} sent
        </span>
      );
    } else if (po.sentAt) {
      masterSubtitles[number] = (
        <span className="font-medium text-emerald-700">Sent ✓</span>
      );
    }
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

  // Look up tables for routing stage-target edits to the right PO row:
  //   subPoIdByDisplayNumber: "PO-00104-A" → sub-PO id (so the Sub-PO timeline
  //     view edits the sub-PO, not the master).
  //   stageEtasByPoId: poId → its saved stage targets (used to surface targets
  //     on whichever PO the active view groups by).
  const subPoIdByDisplayNumber = new Map<string, string>();
  const stageEtasByPoId = new Map<
    string,
    { stage: ProductionStage; targetEndDate: string }[]
  >();
  for (const po of allPos) {
    stageEtasByPoId.set(po.id, po.stageEtas);
    if (po.parentPoId) {
      subPoIdByDisplayNumber.set(
        formatPoNumber(po.shopifyPoNumber, { suffix: po.poSuffix }),
        po.id,
      );
    }
  }

  const timelinePos = filtered.map((po) => ({
    id: po.id,
    shopifyPoNumber: po.shopifyPoNumber,
    supplier: po.supplier,
    stageTargets: po.stageEtas,
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

  // ── "By PO" rows (group === "po"): one row per active sub-PO + standalone
  // master. Walk the PO records (NOT line items) so every sub-PO appears even
  // when its assigned stages currently have no in-flight lines — otherwise a
  // sub-PO whose work has all moved past its stages (or been received) would
  // silently disappear from the list. Masters that have children are skipped
  // here because they're represented by their children rows. ─────────────────
  const incomingPoRows: IncomingPoRow[] = [];
  const skuRowsByPo: Record<string, ReturnType<typeof aggregateIncoming>> = {};
  // Per-(sub-)PO send-status subtitle, surfaced under the PO number cell in
  // both the Sub-PO view's PoExpandableList and the Master view's child
  // cascade (forwarded by PoExpandableList into its nested render).
  const subPoSubtitles: Record<string, React.ReactNode> = {};
  for (const po of allPos) {
    const isSubPo = po.parentPoId !== null;
    const hasChildren = (childCountByMaster.get(po.id) ?? 0) > 0;
    if (!isSubPo && hasChildren) continue; // master with children → skip

    const master = isSubPo ? masterById.get(po.parentPoId!) : po;
    if (!master) continue;

    const poNumber = isSubPo
      ? formatPoNumber(master.shopifyPoNumber, { suffix: po.poSuffix ?? undefined })
      : formatPoNumber(master.shopifyPoNumber);
    const supplierLabel =
      supplierName.get(po.supplierId) ?? po.supplier?.name ?? "—";

    // Owned line items: master's unreceived lines that are currently at a
    // stage assigned to this entry's supplier. Standalone masters own all of
    // their unreceived lines.
    const ownedLines = master.lineItems.filter((li) => {
      if (li.shopifyReceivedAt) return false;
      if (skuSet.size > 0 && !skuSet.has(li.sku)) return false;
      if (!isSubPo) return true;
      const stageOwnerSupplier =
        supplierForStage(order, master.stageAssignments, master.supplierId, li.currentStage) ??
        master.supplierId;
      return stageOwnerSupplier === po.supplierId;
    });

    let incomingQty = 0;
    const byStage: Partial<Record<ProductionStage, number>> = {};
    let nearestEta: string | null = null;
    for (const li of ownedLines) {
      incomingQty += li.quantity;
      byStage[li.currentStage] = (byStage[li.currentStage] ?? 0) + li.quantity;
      const eta = projectEta(order, li.currentStage, today, estimates);
      if (nearestEta === null || eta < nearestEta) nearestEta = eta;
    }

    incomingPoRows.push({
      poNumber,
      poId: master.id,
      supplier: supplierLabel,
      status: master.status,
      incomingQty,
      byStage,
      nearestEta,
    });
    subPoSubtitles[poNumber] = po.sentAt ? (
      <span className="font-medium text-emerald-700">Sent ✓</span>
    ) : (
      <span className="text-zinc-400">Not sent</span>
    );

    skuRowsByPo[poNumber] = aggregateIncoming(
      order,
      ownedLines.map((li) => ({
        sku: li.sku,
        title: li.title,
        quantity: li.quantity,
        currentStage: li.currentStage,
      })),
      estimates,
      today,
    );
  }
  incomingPoRows.sort((a, b) => a.poNumber.localeCompare(b.poNumber));

  // For the Master cascade: when a master row is expanded, surface its
  // children sub-PO rows (already shaped as IncomingPoRow inside
  // incomingPoRows) keyed by the master's display PO number. A standalone
  // master has no entry here — its expansion falls through to the SKU
  // breakdown directly.
  const incomingPoRowByPoNumber = new Map(
    incomingPoRows.map((r) => [r.poNumber, r] as const),
  );
  const subRowsByMasterPoNumber: Record<string, IncomingPoRow[]> = {};
  for (const { po, isMaster } of masterRows) {
    if (!isMaster) continue; // solo master, no children
    const masterPoNumber = formatPoNumber(po.shopifyPoNumber, { isMaster });
    const children = allPos.filter((p) => p.parentPoId === po.id);
    const childRows: IncomingPoRow[] = [];
    for (const child of children) {
      const subPoNumber = formatPoNumber(po.shopifyPoNumber, {
        suffix: child.poSuffix ?? undefined,
      });
      const row = incomingPoRowByPoNumber.get(subPoNumber);
      if (row) childRows.push(row);
    }
    if (childRows.length > 0) {
      subRowsByMasterPoNumber[masterPoNumber] = childRows;
    }
  }

  // Merged SKU map covers both levels: keys for master poNumbers (used when
  // a standalone master cascades straight to its SKU breakdown) and keys
  // for sub-PO poNumbers (used when a sub-PO inside the nested list expands).
  const skuRowsForMasterCascade: Record<
    string,
    ReturnType<typeof aggregateIncoming>
  > = { ...skuRowsByMasterRow, ...skuRowsByPo };

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
        // `c.id` is the line item id from `cards` (one entry per line). The
        // sub-PO's card column is the earliest open stage among its lines, so
        // we collect ids that match that stage — those are the ones that get
        // bulk-advanced when the card is dragged.
        lineItemIdsAtStage: [c.id],
      });
    } else {
      ex.quantity += c.quantity;
      const cIdx = order.indexOf(c.stage);
      const exIdx = order.indexOf(ex.stage);
      if (cIdx < exIdx) {
        // Earlier stage discovered → that's the new column for this card.
        ex.stage = c.stage;
        ex.lineItemIdsAtStage = [c.id];
      } else if (cIdx === exIdx) {
        ex.lineItemIdsAtStage?.push(c.id);
      }
      // c at a later stage → not at the card's column, skip.
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
  const timelinePosByPo = [...poTrackMap.values()].map((g) => {
    // Re-key to the actual sub-PO id when this track represents a sub-PO
    // (multi-supplier split), so target edits hit the supplier's own row
    // and not the master's.
    const trackPoId = subPoIdByDisplayNumber.get(g.poNumber) ?? g.poId;
    return {
    id: trackPoId,
    shopifyPoNumber: g.poNumber,
    supplier: { name: g.supplier },
    stageTargets: stageEtasByPoId.get(trackPoId) ?? [],
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
  };
  });

  // ── Master grouping for Board / Timeline ──────────────────────────────
  // Line items live on the master PO, so we aggregate per `po.id`. A master's
  // supplier label collapses to "Multiple suppliers" once sub-POs route stages
  // to more than one supplier; otherwise it's just the master's own supplier.
  const masterDisplay = (po: { id: string; shopifyPoNumber: string; supplier: { name: string } | null }) => {
    const isMaster = (childCountByMaster.get(po.id) ?? 0) > 0;
    return {
      isMaster,
      number: formatPoNumber(po.shopifyPoNumber, { isMaster }),
      supplier: isMaster ? "Multiple suppliers" : po.supplier?.name ?? "—",
    };
  };

  // Cards: one per master PO, qty summed across that master's line items;
  // stage = the earliest (least-advanced) open stage among them.
  const masterCardMap = new Map<string, KanbanCard>();
  for (const c of cards) {
    const ex = masterCardMap.get(c.poId);
    if (!ex) {
      const po = filtered.find((p) => p.id === c.poId);
      if (!po) continue;
      const { number, supplier } = masterDisplay(po);
      masterCardMap.set(c.poId, {
        ...c,
        id: c.poId,
        sku: number,
        title: supplier,
        poNumber: number,
        supplier,
        locked: false,
      });
    } else {
      ex.quantity += c.quantity;
      if (order.indexOf(c.stage) < order.indexOf(ex.stage)) ex.stage = c.stage;
    }
  }
  const masterCards = [...masterCardMap.values()];

  // Tracks: one per master PO, with stage events merged across ALL of the
  // master's line items.
  const masterTrackMap = new Map<
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
    const { number, supplier } = masterDisplay(po);
    for (const li of po.lineItems) {
      const g =
        masterTrackMap.get(po.id) ??
        {
          poId: po.id,
          poNumber: number,
          supplier,
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
      masterTrackMap.set(po.id, g);
    }
  }
  // Pre-compute per-supplier sub-bars for multi-supplier masters so the
  // Master view stacks one bar per sub-PO (each filtered to that supplier's
  // owned stages — bar A might cover supplier_po + stamping while bar B
  // picks up at polishing and runs to packaging). Standalone masters and
  // master rows with a single supplier fall through to the single-bar path.
  const todayIsoForTimeline = isoDay(new Date());
  const todayMsForTimeline = utcMidnight(todayIsoForTimeline);
  const subPosByMasterId = new Map<string, typeof allPos>();
  for (const po of allPos) {
    if (po.parentPoId) {
      const list = subPosByMasterId.get(po.parentPoId) ?? [];
      list.push(po);
      subPosByMasterId.set(po.parentPoId, list);
    }
  }

  const timelinePosByMaster = [...masterTrackMap.values()].map((g) => {
    const masterPo = allPos.find((p) => p.id === g.poId);
    const subPos = subPosByMasterId.get(g.poId) ?? [];
    const stageEvents = [...g.events.entries()]
      .map(([stage, e]) => ({
        id: `${g.poNumber}-${stage}`,
        stage: stage as ProductionStage,
        enteredAt: e.enteredAt,
        exitedAt: e.exitedAt,
      }))
      .sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());

    // subBars only when the master actually has children; single-supplier
    // POs render one bar like before.
    let subBars: {
      supplierName: string;
      poId: string;
      segs: ReturnType<typeof buildLineSegments>;
    }[] | undefined;
    if (subPos.length > 0 && masterPo) {
      // Walk the master's stage list and group stages by their owning
      // supplier (fall back to master's primary for unassigned stages).
      const assignmentsByStage = new Map(
        masterPo.stageAssignments.map((a) => [a.stage, a.supplierId]),
      );
      const stagesBySupplier = new Map<string, ProductionStage[]>();
      const supplierOrder: string[] = [];
      for (const s of order.slice(0, -1)) {
        const ownerId =
          assignmentsByStage.get(s) ?? masterPo.supplierId;
        if (!stagesBySupplier.has(ownerId)) {
          stagesBySupplier.set(ownerId, []);
          supplierOrder.push(ownerId);
        }
        stagesBySupplier.get(ownerId)!.push(s as ProductionStage);
      }
      // Run buildLineSegments once with the master's combined targets
      // (use the supplier-of-stage's sub-PO targets when available; else
      // master's own), then filter per supplier.
      const combinedTargets = new Map<ProductionStage, number>();
      for (const stage of order.slice(0, -1)) {
        const ownerId =
          assignmentsByStage.get(stage) ?? masterPo.supplierId;
        const sub = subPos.find((s) => s.supplierId === ownerId);
        const target =
          sub?.stageEtas.find((t) => t.stage === stage) ??
          masterPo.stageEtas.find((t) => t.stage === stage);
        if (target) {
          combinedTargets.set(
            stage as ProductionStage,
            utcMidnight(target.targetEndDate),
          );
        }
      }
      const allSegs = buildLineSegments(
        { currentStage: g.currentStage, stageEvents },
        todayMsForTimeline,
        todayIsoForTimeline,
        order,
        estimates,
        combinedTargets,
      );
      subBars = supplierOrder
        .map((supplierId) => {
          const owned = new Set(stagesBySupplier.get(supplierId) ?? []);
          const sub = subPos.find((s) => s.supplierId === supplierId);
          return {
            supplierName: supplierName.get(supplierId) ?? "—",
            // No sub-PO row → fall back to the master id so the inline
            // editor still has somewhere to write (rare edge case).
            poId: sub?.id ?? g.poId,
            segs: allSegs.filter((seg) => owned.has(seg.stage)),
          };
        })
        .filter((b) => b.segs.length > 0);
      if (subBars.length < 2) subBars = undefined; // single supplier → no stack
    }

    return {
      id: g.poId,
      shopifyPoNumber: g.poNumber,
      supplier: { name: g.supplier },
      stageTargets: stageEtasByPoId.get(g.poId) ?? [],
      lineItems: [
        {
          id: g.poNumber,
          sku: g.poNumber,
          title: g.supplier,
          currentStage: g.currentStage,
          supplierName: g.supplier,
          poNumber: g.poNumber,
          stageEvents,
          subBars,
        },
      ],
    };
  });

  // SKU breakdown keyed by master PO label — for the drill-down panel on
  // Board / Timeline when a master card or track is selected.
  const skuRowsByMaster: Record<string, ReturnType<typeof aggregateIncoming>> = {};
  for (const po of filtered) {
    const { number } = masterDisplay(po);
    const lines = po.lineItems
      .filter((li) => !li.shopifyReceivedAt && (skuSet.size === 0 || skuSet.has(li.sku)))
      .map((li) => ({ sku: li.sku, title: li.title, quantity: li.quantity, currentStage: li.currentStage }));
    if (lines.length > 0) {
      skuRowsByMaster[number] = aggregateIncoming(order, lines, estimates, today);
    }
  }

  const listFilters = (
    <ListFilters production={{ suppliers, supplierId, status, stage }} />
  );

  // Board and Timeline render at the chosen grouping. Master uses the
  // master-PO cards / tracks built above (line items live on the master, so
  // they aggregate naturally); Sub-PO and SKU use the existing rollups.
  const renderGroup: "master" | "po" | "sku" = group;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="POs & Production" />
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
            // Master grouping cascades twice: clicking a master row reveals
            // its sub-PO list inline, and clicking a sub-PO row inside that
            // reveals its SKU breakdown. A standalone master skips the
            // sub-PO level and cascades straight to SKUs.
            <div className="mt-4">
              <PoExpandableList
                rows={incomingMasterRows}
                skuRowsByPo={skuRowsForMasterCascade}
                stageLabels={stageLabels}
                // Master rows show "N/M sent"; children sub-PO rows show
                // "Sent ✓ / Not sent" via the merged map (PoExpandableList
                // forwards `subtitles` into its nested cascade).
                subtitles={{ ...subPoSubtitles, ...masterSubtitles }}
                subRowsByPoNumber={subRowsByMasterPoNumber}
              />
            </div>
          ) : (
            <div className="mt-4">
              {group === "po" ? (
                <div className="mt-4">
                  <PoExpandableList
                    rows={incomingPoRows}
                    skuRowsByPo={skuRowsByPo}
                    stageLabels={stageLabels}
                    subtitles={subPoSubtitles}
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
            {renderGroup === "master" ? (
              masterCards.length === 0 ? (
                <p className="text-sm text-zinc-400">No POs match.</p>
              ) : (
                <PoExpandableBoard
                  cards={masterCards}
                  stages={order}
                  skuRowsByPo={skuRowsByMaster}
                  stageLabels={stageLabels}
                />
              )
            ) : renderGroup === "po" ? (
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
          {renderGroup === "master" ? (
            <PoExpandableTimeline
              pos={timelinePosByMaster}
              estimates={estimates}
              stageLabels={stageLabels}
              order={order}
              skuRowsByPo={skuRowsByMaster}
              etaSaveRouteBase="/api/production/po"
            />
          ) : renderGroup === "po" ? (
            <PoExpandableTimeline
              pos={timelinePosByPo}
              estimates={estimates}
              stageLabels={stageLabels}
              order={order}
              skuRowsByPo={skuRowsByPo}
              etaSaveRouteBase="/api/production/po"
            />
          ) : (
            <ProductionTimeline
              pos={timelinePos}
              estimates={estimates}
              stageLabels={stageLabels}
              order={order}
              etaSaveRouteBase="/api/production/po"
            />
          )}
        </>
      )}

      </div>
    </div>
  );
}
