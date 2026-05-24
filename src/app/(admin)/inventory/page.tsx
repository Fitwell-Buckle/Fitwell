import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ne } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPo } from "@/lib/schema";
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
import { STAGE_LABELS } from "@/lib/production/stages";
import { fmtDate } from "@/lib/production/display";
import { getStageEstimates } from "@/lib/production/cycle-time-data";
import { aggregateIncoming, type IncomingLine } from "@/lib/production/inventory";

export const metadata: Metadata = {
  title: "Incoming inventory | Fitwell Admin",
};

export default async function InventoryPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const [estimates, pos] = await Promise.all([
    getStageEstimates(),
    db.query.productionPo.findMany({
      where: ne(productionPo.status, "cancelled"),
      columns: { id: true },
      with: {
        lineItems: {
          columns: {
            sku: true,
            title: true,
            quantity: true,
            currentStage: true,
            shopifyReceivedAt: true,
          },
        },
      },
    }),
  ]);

  // Incoming = produced-but-not-yet-received line items.
  const lines: IncomingLine[] = pos
    .flatMap((po) => po.lineItems)
    .filter((li) => !li.shopifyReceivedAt)
    .map((li) => ({
      sku: li.sku,
      title: li.title,
      quantity: li.quantity,
      currentStage: li.currentStage,
    }));

  const today = new Date().toISOString().slice(0, 10);
  const rows = aggregateIncoming(lines, estimates, today);
  const totalIncoming = rows.reduce((sum, r) => sum + r.incomingQty, 0);

  return (
    <div>
      <PageHeader title="Incoming inventory" />
      <p className="mt-1 text-sm text-zinc-500">
        Units in production that haven&apos;t been received into Shopify yet, by
        SKU. ETA is projected from cycle-time estimates.
      </p>

      <DataTable className="mt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Incoming</TableHead>
              <TableHead>By stage</TableHead>
              <TableHead>Nearest ETA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-zinc-400">
                  Nothing in production right now.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.sku}>
                  <TableCell>
                    <Mono>{r.sku}</Mono>
                  </TableCell>
                  <TableCell className="text-zinc-700">{r.title}</TableCell>
                  <TableCell className="text-right font-medium text-zinc-900">
                    {r.incomingQty}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(r.byStage).map(([stage, qty]) => (
                        <span
                          key={stage}
                          className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600"
                        >
                          {STAGE_LABELS[stage as keyof typeof STAGE_LABELS]}: {qty}
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

      {rows.length > 0 && (
        <p className="mt-3 text-right text-sm text-zinc-500">
          Total incoming units: <span className="font-medium text-zinc-900">{totalIncoming}</span>
        </p>
      )}
    </div>
  );
}
