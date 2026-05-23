import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { KanbanBoard, type KanbanCard } from "./kanban-board";

export const metadata: Metadata = {
  title: "Production Board | Fitwell Admin",
};

export default async function KanbanPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const lineItems = await db.query.productionPoLineItem.findMany({
    columns: { id: true, sku: true, title: true, quantity: true, currentStage: true },
    with: {
      po: {
        columns: {
          id: true,
          shopifyPoNumber: true,
          status: true,
          lockStagesTogether: true,
        },
        with: { supplier: { columns: { name: true } } },
      },
    },
  });

  // Hide cancelled POs from the board.
  const cards: KanbanCard[] = lineItems
    .filter((li) => li.po && li.po.status !== "cancelled")
    .map((li) => ({
      id: li.id,
      sku: li.sku,
      title: li.title,
      quantity: li.quantity,
      stage: li.currentStage,
      poId: li.po!.id,
      poNumber: li.po!.shopifyPoNumber,
      supplier: li.po!.supplier?.name ?? "—",
      locked: li.po!.lockStagesTogether,
    }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title="Production Board" />
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/modules/production">List</Link>
          </Button>
          <Button asChild>
            <Link href="/modules/production/po/new">New PO</Link>
          </Button>
        </div>
      </div>

      <p className="mt-2 text-sm text-zinc-500">
        Drag a card to any stage. Cards on a locked PO move the whole PO together.
      </p>

      <div className="mt-6">
        {cards.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No active line items. Create a PO to populate the board.
          </p>
        ) : (
          <KanbanBoard cards={cards} />
        )}
      </div>
    </div>
  );
}
