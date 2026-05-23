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
import { STAGES, STAGE_LABELS, derivePoStage } from "@/lib/production/stages";
import {
  PO_STATUSES,
  STATUS_LABELS,
  statusBadgeClass,
  stageBadgeClass,
  fmtDate,
} from "@/lib/production/display";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Production | Fitwell Admin",
};

const selectClass =
  "h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300";

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const supplierId =
    typeof params.supplier === "string" ? params.supplier : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const stage = typeof params.stage === "string" ? params.stage : undefined;

  const conditions = [];
  if (supplierId) conditions.push(eq(productionPo.supplierId, supplierId));
  if (status) conditions.push(eq(productionPo.status, status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [pos, suppliers] = await Promise.all([
    db.query.productionPo.findMany({
      where,
      orderBy: desc(productionPo.createdAt),
      with: {
        supplier: { columns: { name: true } },
        lineItems: { columns: { currentStage: true } },
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

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title="Production" />
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/modules/production/suppliers">Suppliers</Link>
          </Button>
          <Button asChild>
            <Link href="/modules/production/po/new">New PO</Link>
          </Button>
        </div>
      </div>

      <form action="" method="GET" className="mt-6 flex flex-wrap items-center gap-2">
        <select name="supplier" defaultValue={supplierId ?? ""} className={selectClass}>
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ""} className={selectClass}>
          <option value="">All statuses</option>
          {PO_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select name="stage" defaultValue={stage ?? ""} className={selectClass}>
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        <Button type="submit">Filter</Button>
        {(supplierId || status || stage) && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/modules/production">Clear</Link>
          </Button>
        )}
      </form>

      <DataTable className="mt-6">
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
                  No production POs yet. Create one to start tracking.
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
    </div>
  );
}
