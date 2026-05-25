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
import { derivePoStage, STAGE_LABELS } from "@/lib/production/stages";
import { fmtDate } from "@/lib/production/display";
import {
  getCatalogCached,
  getCatalogGroupsCached,
  makeLineAttrs,
  makeCollectionLookup,
  type CatalogVariant,
  type CatalogCollectionGroup,
  type LineAttrInput,
} from "@/lib/catalog/load";
import { getStageEstimates } from "@/lib/production/cycle-time-data";
import { aggregateIncoming, type IncomingLine } from "@/lib/production/inventory";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { ProductionViewToggle } from "../view-toggle";
import { KanbanBoard, type KanbanCard } from "../kanban/kanban-board";
import { ProductionTimeline } from "../production-timeline";

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
  const collectionParam = typeof params.collection === "string" ? params.collection : "";
  const sizeParam = typeof params.size === "string" ? params.size : "";
  const colorParam = typeof params.color === "string" ? params.color : "";
  const materialParam = typeof params.material === "string" ? params.material : "";

  // Load all non-cancelled POs once. The Incoming Inventory view needs the full
  // set; the Board / Timeline views filter this in memory (small data set).
  const [allPos, suppliers, estimates] = await Promise.all([
    db.query.productionPo.findMany({
      where: ne(productionPo.status, "cancelled"),
      orderBy: desc(productionPo.createdAt),
      with: {
        supplier: { columns: { name: true } },
        lineItems: {
          with: { stageEvents: { orderBy: asc(productionStageEvent.enteredAt) } },
        },
      },
    }),
    db.query.supplier.findMany({ columns: { id: true, name: true } }),
    getStageEstimates(),
  ]);

  // Resolve each line's size/colour/material + collection from the catalog
  // (optional, cached). These power the standardized filter.
  let catalog: CatalogVariant[] = [];
  let groups: CatalogCollectionGroup[] = [];
  try {
    [catalog, groups] = await Promise.all([getCatalogCached(), getCatalogGroupsCached()]);
  } catch {
    /* filters degrade gracefully when Shopify is unavailable */
  }
  const { sizeOf: lineSize, colorOf: lineColor, materialOf: lineMaterial } =
    makeLineAttrs(catalog);
  const { inCollection, options: collectionOptions } = makeCollectionLookup(groups);

  const allLines = allPos.flatMap((po) => po.lineItems);
  const sizeOptions = [
    ...new Set(allLines.map(lineSize).filter((s): s is number => s != null)),
  ].sort((a, b) => a - b);
  const colorOptions = [
    ...new Set(allLines.map(lineColor).filter((c): c is string => !!c)),
  ].sort((a, b) => a.localeCompare(b));
  const materialOptions = [
    ...new Set(allLines.map(lineMaterial).filter((m): m is string => !!m)),
  ].sort((a, b) => a.localeCompare(b));

  // A line matches the catalog filters when every active one matches.
  const matchesCatalog = (li: LineAttrInput): boolean =>
    (!collectionParam || inCollection(li, collectionParam)) &&
    (!sizeParam || lineSize(li) === Number(sizeParam)) &&
    (!colorParam || lineColor(li) === colorParam) &&
    (!materialParam || lineMaterial(li) === materialParam);

  // ── Incoming inventory: produced-but-not-received lines that match filters ──
  const incomingLines: IncomingLine[] = allLines
    .filter((li) => !li.shopifyReceivedAt && matchesCatalog(li))
    .map((li) => ({
      sku: li.sku,
      title: li.title,
      quantity: li.quantity,
      currentStage: li.currentStage,
    }));
  const today = new Date().toISOString().slice(0, 10);
  const incomingRows = aggregateIncoming(incomingLines, estimates, today);
  const totalIncoming = incomingRows.reduce((sum, r) => sum + r.incomingQty, 0);

  // ── Board / Timeline: the filtered PO set (a PO matches if any line does) ──
  const filtered = allPos
    .filter((po) => !statusFilter || po.status === statusFilter)
    .filter((po) => !supplierId || po.supplierId === supplierId)
    .map((po) => ({
      ...po,
      derivedStage: derivePoStage(po.lineItems.map((li) => li.currentStage)),
    }))
    .filter((po) => !stage || po.derivedStage === stage)
    .filter((po) => po.lineItems.some(matchesCatalog));

  const cards: KanbanCard[] = filtered.flatMap((po) =>
    po.lineItems.map((li) => ({
      id: li.id,
      sku: li.sku,
      title: li.title,
      quantity: li.quantity,
      stage: li.currentStage,
      poId: po.id,
      poNumber: po.shopifyPoNumber,
      supplier: po.supplier?.name ?? "—",
      locked: po.lockStagesTogether,
    })),
  );

  const filterProps = {
    collections: collectionOptions,
    collection: collectionParam,
    sizeOptions,
    size: sizeParam,
    colorOptions,
    color: colorParam,
    materialOptions,
    material: materialParam,
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Production Summary" />
        <ProductionViewToggle view={view} />
      </div>

      {view === "inventory" && (
        <>
          <CatalogFilters {...filterProps} />
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
                                {STAGE_LABELS[stg as keyof typeof STAGE_LABELS]}: {qty}
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
          <CatalogFilters
            {...filterProps}
            production={{ suppliers, supplierId, status, stage }}
          />
          <div className="mt-6">
            {cards.length === 0 ? (
              <p className="text-sm text-zinc-400">No line items match.</p>
            ) : (
              <KanbanBoard cards={cards} />
            )}
          </div>
        </>
      )}

      {view === "timeline" && (
        <>
          <CatalogFilters
            {...filterProps}
            production={{ suppliers, supplierId, status, stage }}
          />
          <ProductionTimeline pos={filtered} estimates={estimates} />
        </>
      )}
    </div>
  );
}
