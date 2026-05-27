import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isNotNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPo } from "@/lib/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { supplierForStage } from "@/lib/production/stage-owners";
import { getStageOrder } from "@/lib/production/stage-labels";
import { terminalStage } from "@/lib/production/stages";
import { formatPoNumber } from "@/lib/production/sub-po";
import { KanbanBoard, type KanbanCard } from "./kanban-board";

export const metadata: Metadata = {
  title: "Production Board | Fitwell Admin",
};

export default async function KanbanPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const order = await getStageOrder();
  const terminal = terminalStage(order);

  const lineItems = await db.query.productionPoLineItem.findMany({
    columns: { id: true, sku: true, title: true, quantity: true, currentStage: true },
    with: {
      po: {
        columns: {
          id: true,
          shopifyPoNumber: true,
          status: true,
          lockStagesTogether: true,
          supplierId: true,
        },
        with: {
          supplier: { columns: { name: true } },
          stageAssignments: { columns: { stage: true, supplierId: true } },
        },
      },
    },
  });

  // Supplier names (the owning supplier of a stage may differ from the PO's
  // primary) + the sub-PO suffix per (master, supplier), so each card shows the
  // sub-PO actually responsible for its current stage (e.g. 00118-B).
  const suppliers = await db.query.supplier.findMany({ columns: { id: true, name: true } });
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const subRows = await db
    .select({
      parentPoId: productionPo.parentPoId,
      supplierId: productionPo.supplierId,
      poSuffix: productionPo.poSuffix,
    })
    .from(productionPo)
    .where(isNotNull(productionPo.parentPoId));
  const suffixByMasterSupplier = new Map<string, string>();
  for (const r of subRows) {
    if (r.parentPoId && r.poSuffix) {
      suffixByMasterSupplier.set(`${r.parentPoId}:${r.supplierId}`, r.poSuffix);
    }
  }

  // Board = in-progress work, any age: only active POs that still have an
  // unfinished line item (hides completed + cancelled, regardless of date).
  const byPo = new Map<string, typeof lineItems>();
  for (const li of lineItems) {
    if (!li.po) continue;
    const list = byPo.get(li.po.id) ?? [];
    list.push(li);
    byPo.set(li.po.id, list);
  }
  const livePoIds = new Set<string>();
  for (const [poId, lines] of byPo) {
    const po = lines[0].po!;
    if (po.status === "active" && lines.some((l) => l.currentStage !== terminal)) {
      livePoIds.add(poId);
    }
  }

  const cards: KanbanCard[] = lineItems
    .filter((li) => li.po && livePoIds.has(li.po.id))
    .map((li) => {
      const po = li.po!;
      const ownerId =
        supplierForStage(order, po.stageAssignments, po.supplierId, li.currentStage) ??
        po.supplierId;
      const suffix = suffixByMasterSupplier.get(`${po.id}:${ownerId}`);
      return {
        id: li.id,
        sku: li.sku,
        title: li.title,
        quantity: li.quantity,
        stage: li.currentStage,
        poId: po.id,
        poNumber: formatPoNumber(po.shopifyPoNumber, { suffix }),
        supplier: supplierName.get(ownerId) ?? po.supplier?.name ?? "—",
        locked: po.lockStagesTogether,
      };
    });

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
        In-progress POs only. Drag a card to any stage. Cards on a locked PO move
        the whole PO together.
      </p>

      <div className="mt-6">
        {cards.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No in-progress line items. Create a PO to populate the board.
          </p>
        ) : (
          <KanbanBoard cards={cards} stages={order} />
        )}
      </div>
    </div>
  );
}
