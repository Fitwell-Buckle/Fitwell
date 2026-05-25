import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPo } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { KanbanBoard, type KanbanCard } from "../kanban/kanban-board";
import { ProductionTimeline } from "../production-timeline";

export const metadata: Metadata = {
  title: "Production Summary | Fitwell Admin",
};

export default async function ProductionSummaryPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  // In-progress POs only (matches the timeline below).
  const pos = await db.query.productionPo.findMany({
    where: inArray(productionPo.status, ["active", "on_hold"]),
    orderBy: desc(productionPo.createdAt),
    with: {
      supplier: { columns: { name: true } },
      lineItems: {
        columns: { id: true, sku: true, title: true, quantity: true, currentStage: true },
      },
    },
  });

  const cards: KanbanCard[] = pos.flatMap((po) =>
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
        <PageHeader title="Production Summary" />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/modules/production">Purchase Orders</Link>
        </Button>
      </div>

      <div className="mt-6">
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
