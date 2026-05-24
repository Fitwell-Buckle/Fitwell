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
} from "@/lib/production/display";
import { cn } from "@/lib/utils";
import { ProductionFilters } from "./production-filters";
import { KanbanBoard, type KanbanCard } from "./kanban/kanban-board";

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
          },
        },
      },
    }),
    db.query.supplier.findMany({ columns: { id: true, name: true } }),
  ]);

  const rows = pos
    .map((po) => ({
      ...po,
      derivedStage: derivePoStage(po.lineItems.map((li) => li.currentStage)),
      itemCount: po.lineItems.length,
    }))
    // Stage filter is applied on the derived stage (cheap at our scale).
    .filter((po) => !stage || po.derivedStage === stage);

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
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/modules/production/gantt">Timeline</Link>
          </Button>
          <Button asChild>
            <Link href="/modules/production/po/new">New PO</Link>
          </Button>
        </div>
      </div>

      <ProductionFilters
        suppliers={suppliers}
        supplierId={supplierId}
        status={status}
        stage={stage}
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
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Board</h2>
        {cards.length === 0 ? (
          <p className="text-sm text-zinc-400">No line items to show.</p>
        ) : (
          <KanbanBoard cards={cards} />
        )}
      </div>
    </div>
  );
}
