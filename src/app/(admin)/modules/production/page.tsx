import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, and, desc, isNull, isNotNull } from "drizzle-orm";
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
import { ListFilters } from "@/components/catalog/list-filters";
import { parseDateRange } from "@/lib/date-range";
import { formatPoNumber } from "@/lib/production/sub-po";

export const metadata: Metadata = {
  title: "Supplier POs | Fitwell Admin",
};

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const { from, to } = parseDateRange(params);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  const supplierId =
    typeof params.supplier === "string" ? params.supplier : "";
  const stage = typeof params.stage === "string" ? params.stage : "";
  // Item Chooser filter: the chosen product SKU(s) (comma-separated in the URL).
  const skuSet = new Set(
    (typeof params.sku === "string" ? params.sku : "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  // Default to Open (active). The "all" sentinel shows every status.
  const status =
    typeof params.status === "string" && params.status ? params.status : "active";
  const statusFilter = status === "all" ? undefined : status;

  const conditions = [
    // Hide sub-POs from the list — they're shown under their master.
    isNull(productionPo.parentPoId),
  ];
  if (supplierId) conditions.push(eq(productionPo.supplierId, supplierId));
  if (statusFilter) conditions.push(eq(productionPo.status, statusFilter));
  const where = and(...conditions);

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

  // Which listed POs are masters (have sub-POs)? Their supplier shows as
  // "Multiple suppliers" and their number as "00100-Master".
  const childRows = await db
    .select({ parentPoId: productionPo.parentPoId })
    .from(productionPo)
    .where(isNotNull(productionPo.parentPoId));
  const masterIds = new Set(
    childRows.map((r) => r.parentPoId).filter((x): x is string => !!x),
  );

  const rows = pos
    .map((po) => ({
      ...po,
      derivedStage: derivePoStage(po.lineItems.map((li) => li.currentStage)),
      itemCount: po.lineItems.length,
      isMaster: masterIds.has(po.id),
    }))
    // Date filter on the PO's issued date (matches the B2B/Influencer lists).
    .filter((po) => po.issuedDate >= fromStr && po.issuedDate <= toStr)
    // Stage filter is applied on the derived stage (cheap at our scale).
    .filter((po) => !stage || po.derivedStage === stage)
    // Item Chooser filter: keep POs with a line item for a chosen product.
    .filter((po) => skuSet.size === 0 || po.lineItems.some((li) => skuSet.has(li.sku)));

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title="Supplier POs" />
        <Button asChild>
          <Link href="/modules/production/po/new">New PO</Link>
        </Button>
      </div>

      <ListFilters production={{ suppliers, supplierId, status, stage }} />

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
                      <Mono>{formatPoNumber(po.shopifyPoNumber, { isMaster: po.isMaster })}</Mono>
                    </Link>
                  </TableCell>
                  <TableCell>
                    {po.isMaster ? "Multiple suppliers" : po.supplier?.name ?? "—"}
                  </TableCell>
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
