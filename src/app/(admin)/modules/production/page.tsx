import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, and, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPo } from "@/lib/schema";
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
import { STAGE_LABELS, derivePoStage } from "@/lib/production/stages";
import {
  STATUS_LABELS,
  statusBadgeClass,
  stageBadgeClass,
  fmtDate,
  skuSize,
} from "@/lib/production/display";
import { getCatalogCached, type CatalogVariant } from "@/lib/catalog/load";
import { cn } from "@/lib/utils";
import { ProductionFilters } from "./production-filters";
import { KanbanBoard, type KanbanCard } from "./kanban/kanban-board";
import { ProductionTimeline } from "./production-timeline";

export const metadata: Metadata = {
  title: "POs and Production | Fitwell Admin",
};

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const supplierId =
    typeof params.supplier === "string" ? params.supplier : "";
  const stage = typeof params.stage === "string" ? params.stage : "";
  const sizeParam = typeof params.size === "string" ? params.size : "";
  const colorParam = typeof params.color === "string" ? params.color : "";
  // Default to Open (active). The "all" sentinel shows every status.
  const status =
    typeof params.status === "string" && params.status ? params.status : "active";
  const statusFilter = status === "all" ? undefined : status;

  const conditions = [];
  if (supplierId) conditions.push(eq(productionPo.supplierId, supplierId));
  if (statusFilter) conditions.push(eq(productionPo.status, statusFilter));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [pos, suppliers] = await Promise.all([
    db.query.productionPo.findMany({
      where,
      orderBy: desc(productionPo.createdAt),
      with: {
        supplier: { columns: { name: true } },
        lineItems: {
          columns: {
            id: true,
            sku: true,
            title: true,
            quantity: true,
            currentStage: true,
            shopifyVariantId: true,
          },
        },
      },
    }),
    db.query.supplier.findMany({ columns: { id: true, name: true } }),
  ]);

  // Catalog gives each line its size/colour (by variant id); optional, cached.
  let catalog: CatalogVariant[] = [];
  try {
    catalog = await getCatalogCached();
  } catch {
    /* size falls back to the SKU; colour is unavailable without the catalog */
  }
  const attrsByVariant = new Map(
    catalog.map((v) => [v.shopifyVariantId, { sizeMm: v.sizeMm, color: v.color }]),
  );
  type LineLike = { sku: string; shopifyVariantId: string | null };
  const lineSize = (li: LineLike): number | null => {
    const a = li.shopifyVariantId ? attrsByVariant.get(li.shopifyVariantId) : null;
    if (a?.sizeMm != null) return a.sizeMm;
    const s = skuSize(li.sku);
    return s === 999999 ? null : s;
  };
  const lineColor = (li: LineLike): string | null =>
    (li.shopifyVariantId ? attrsByVariant.get(li.shopifyVariantId)?.color : null) ?? null;

  // Filter options from the line items currently in view.
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
      itemCount: po.lineItems.length,
    }))
    // Stage filter is applied on the derived stage (cheap at our scale).
    .filter((po) => !stage || po.derivedStage === stage)
    // Size/colour: keep POs with at least one matching line item.
    .filter((po) => !sizeParam || po.lineItems.some((li) => lineSize(li) === Number(sizeParam)))
    .filter((po) => !colorParam || po.lineItems.some((li) => lineColor(li) === colorParam));

  // Board cards = line items of the POs currently shown in the list.
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
      <div className="flex items-center justify-between">
        <PageHeader title="POs and Production" />
        <Button asChild>
          <Link href="/modules/production/po/new">New PO</Link>
        </Button>
      </div>

      <h2 className="mt-6 text-sm font-semibold text-zinc-900">PO List</h2>

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

      <DataTable className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO #</TableHead>
              <TableHead>Supplier</TableHead>
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
                <TableCell colSpan={7} className="py-8 text-center text-zinc-400">
                  No POs match. Create one to start tracking.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((po) => (
                <TableRow key={po.id}>
                  <TableCell>
                    <Link
                      href={`/modules/production/po/${po.id}`}
                      className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                    >
                      <Mono>{po.shopifyPoNumber}</Mono>
                    </Link>
                  </TableCell>
                  <TableCell>{po.supplier?.name ?? "—"}</TableCell>
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
                  <TableCell className="text-zinc-500">
                    {fmtDate(po.issuedDate)}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {fmtDate(po.expectedDeliveryDate)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DataTable>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Production</h2>
        {cards.length === 0 ? (
          <p className="text-sm text-zinc-400">No line items to show.</p>
        ) : (
          <KanbanBoard cards={cards} />
        )}
      </div>

      <ProductionTimeline />
    </div>
  );
}
