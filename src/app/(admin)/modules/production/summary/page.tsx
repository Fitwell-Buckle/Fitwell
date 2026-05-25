import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPo, productionStageEvent } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { derivePoStage } from "@/lib/production/stages";
import { getCatalogCached, makeLineAttrs, type CatalogVariant } from "@/lib/catalog/load";
import { getStageEstimates } from "@/lib/production/cycle-time-data";
import { ProductionFilters } from "../production-filters";
import { KanbanBoard, type KanbanCard } from "../kanban/kanban-board";
import { ProductionTimeline } from "../production-timeline";

export const metadata: Metadata = {
  title: "Production Summary | Fitwell Admin",
};

export default async function ProductionSummaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const supplierId = typeof params.supplier === "string" ? params.supplier : "";
  const stage = typeof params.stage === "string" ? params.stage : "";
  const status =
    typeof params.status === "string" && params.status ? params.status : "active";
  const statusFilter = status === "all" ? undefined : status;
  const sizeParam = typeof params.size === "string" ? params.size : "";
  const colorParam = typeof params.color === "string" ? params.color : "";

  const conditions = [];
  if (supplierId) conditions.push(eq(productionPo.supplierId, supplierId));
  if (statusFilter) conditions.push(eq(productionPo.status, statusFilter));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [pos, suppliers, estimates] = await Promise.all([
    db.query.productionPo.findMany({
      where,
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

  // Resolve each line's size/colour from the catalog (optional, cached).
  let catalog: CatalogVariant[] = [];
  try {
    catalog = await getCatalogCached();
  } catch {
    /* size falls back to the SKU; colour unavailable without the catalog */
  }
  const { sizeOf: lineSize, colorOf: lineColor } = makeLineAttrs(catalog);

  const allLines = pos.flatMap((po) => po.lineItems);
  const sizeOptions = [
    ...new Set(allLines.map(lineSize).filter((s): s is number => s != null)),
  ].sort((a, b) => a - b);
  const colorOptions = [
    ...new Set(allLines.map(lineColor).filter((c): c is string => !!c)),
  ].sort((a, b) => a.localeCompare(b));

  const rows = pos
    .map((po) => ({
      ...po,
      derivedStage: derivePoStage(po.lineItems.map((li) => li.currentStage)),
    }))
    .filter((po) => !stage || po.derivedStage === stage)
    .filter((po) => !sizeParam || po.lineItems.some((li) => lineSize(li) === Number(sizeParam)))
    .filter((po) => !colorParam || po.lineItems.some((li) => lineColor(li) === colorParam));

  const cards: KanbanCard[] = rows.flatMap((po) =>
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

  return (
    <div>
      <PageHeader title="Production Summary" />

      <ProductionFilters
        suppliers={suppliers}
        supplierId={supplierId}
        status={status}
        stage={stage}
        size={sizeParam}
        color={colorParam}
        sizeOptions={sizeOptions}
        colorOptions={colorOptions}
      />

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Production</h2>
        {cards.length === 0 ? (
          <p className="text-sm text-zinc-400">No line items match.</p>
        ) : (
          <KanbanBoard cards={cards} />
        )}
      </div>

      <ProductionTimeline pos={rows} estimates={estimates} />
    </div>
  );
}
