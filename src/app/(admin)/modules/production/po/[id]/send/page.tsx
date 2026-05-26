import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getPoDetail, getSupplierLineCosts } from "@/lib/production/service";
import { getShopifyClient } from "@/lib/shopify/client";
import { getStoreLogoUrl } from "@/lib/shopify/brand";
import { getCatalogCached, makeLineAttrs } from "@/lib/catalog/load";
import { fmtMoney, fmtDate, STATUS_LABELS, skuSize } from "@/lib/production/display";
import { STAGE_LABELS, STAGES, type ProductionStage } from "@/lib/production/stages";
import { formatPoNumber, planSubPos } from "@/lib/production/sub-po";
import { usesRawBlankSummary, summarizeRawBlanks } from "@/lib/production/raw-blank";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { SendForm } from "./send-form";

export const metadata: Metadata = {
  title: "Send PO | Fitwell Admin",
};

interface AddressLike {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  zip?: string | null;
  country?: string | null;
}

function formatAddress(a: AddressLike | null | undefined): string | null {
  if (!a) return null;
  const line1 = [a.address1, a.address2].filter(Boolean).join(", ");
  const line2 = [a.city, a.province, a.zip].filter(Boolean).join(" ");
  const parts = [line1, line2, a.country].filter(Boolean);
  return parts.length ? parts.join("\n") : null;
}

export default async function SendPoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;
  const po = await getPoDetail(id);
  if (!po) notFound();

  // Sub-POs carry no line items of their own — they render the master's. The
  // sub-PO is sent to its own supplier, scoped to the stages that supplier owns.
  const isSubPo = !!po.parentPoId;
  const master = isSubPo ? await getPoDetail(po.parentPoId as string) : null;
  const itemSource = master ?? po;
  const poNumberDisplay = formatPoNumber(po.shopifyPoNumber, { suffix: po.poSuffix });
  let supplierStageKeys: ProductionStage[] = [];
  if (master) {
    const plan = planSubPos(
      STAGES.filter((s) => s !== "complete"),
      master.stageAssignments,
      master.supplierId,
    );
    supplierStageKeys = plan.find((p) => p.supplierId === po.supplierId)?.stages ?? [];
  }
  // Opening "supplier_po" state is owned for routing but not a labelled work step.
  const supplierStages = supplierStageKeys
    .filter((s) => s !== "supplier_po")
    .map((s) => STAGE_LABELS[s]);

  // Raw-blank summary: a pre-polishing supplier (stamping/EDM) gets items grouped
  // by size + material (colour is irrelevant to the blank). Needs the catalog to
  // resolve size/material; if unavailable we fall back to per-SKU lines.
  let lineAttrs: ReturnType<typeof makeLineAttrs> | null = null;
  if (usesRawBlankSummary(supplierStageKeys)) {
    try {
      lineAttrs = makeLineAttrs(await getCatalogCached());
    } catch {
      lineAttrs = null;
    }
  }
  const summarize = !!lineAttrs;

  // The PO is sent to the vendor (supplier).
  const defaultTo = po.supplier?.contactEmail ?? "";
  const logoUrl = await getStoreLogoUrl();

  // Ship To = warehouse contact info; needs read_locations, falls back to name.
  let warehouseName = po.locationName ?? null;
  let warehouseAddress: string | null = null;
  let warehousePhone: string | null = null;
  if (po.shopifyLocationId) {
    try {
      const loc = await getShopifyClient().getLocation(po.shopifyLocationId);
      warehouseName = loc.name ?? warehouseName;
      warehouseAddress = formatAddress(loc);
      warehousePhone = loc.phone;
    } catch {
      /* read_locations not granted — show stored name only */
    }
  }

  const items = [...itemSource.lineItems].sort(
    (a, b) => skuSize(a.sku) - skuSize(b.sku) || a.sku.localeCompare(b.sku),
  );
  const total = items.reduce((s, li) => s + (li.unitCostCents ?? 0) * li.quantity, 0);

  // Raw-blank rows + total pieces (when summarizing for a stamping/EDM supplier).
  const rawBlanks =
    summarize && lineAttrs
      ? summarizeRawBlanks(
          items.map((li) => ({
            sku: li.sku,
            quantity: li.quantity,
            sizeMm: lineAttrs.sizeOf(li),
            material: lineAttrs.materialOf(li),
            lineItemId: li.id,
          })),
        )
      : [];
  const totalPieces = rawBlanks.reduce((s, g) => s + g.quantity, 0);
  // On a sub-PO the figures are what we pay THIS supplier, per line — not the
  // master's internal production cost. Costs live on the master, keyed by
  // (supplier, line); look up this supplier's slice.
  const supplierUnit = new Map<string, number | null>();
  if (isSubPo) {
    const costs = await getSupplierLineCosts(itemSource.id);
    for (const c of costs) {
      if (c.supplierId === po.supplierId) supplierUnit.set(c.lineItemId, c.unitCostCents);
    }
  }
  const supplierTotalCents = isSubPo
    ? items.reduce((s, li) => s + (supplierUnit.get(li.id) ?? 0) * li.quantity, 0)
    : 0;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between print:hidden">
        <PageHeader title={`Send PO ${poNumberDisplay}`} />
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/modules/production/po/${po.id}`}>Back</Link>
        </Button>
      </div>

      <SendForm poId={po.id} defaultTo={defaultTo} ccEmail={session.user?.email ?? null} />

      {/* Printable document */}
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-8 print:border-0 print:p-0">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-lg font-semibold text-zinc-900">
            Purchase Order {poNumberDisplay}
          </h1>
          {/* brightness-0 renders any logo (incl. the dynamic Shopify one) as solid black */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt="Fitwell"
            className="h-8 w-auto shrink-0 [filter:brightness(0)]"
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-400">Vendor</div>
            <div className="mt-1 font-medium text-zinc-900">{po.supplier?.name ?? "—"}</div>
            {po.supplier?.contactName && (
              <div className="text-sm text-zinc-500">{po.supplier.contactName}</div>
            )}
            {po.supplier?.contactEmail && (
              <div className="text-sm text-zinc-500">{po.supplier.contactEmail}</div>
            )}
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-400">Bill To</div>
            <div className="mt-1 font-medium text-zinc-900">{po.company?.name ?? "—"}</div>
            {po.company?.contactName && (
              <div className="text-sm text-zinc-500">{po.company.contactName}</div>
            )}
            {po.company?.contactEmail && (
              <div className="text-sm text-zinc-500">{po.company.contactEmail}</div>
            )}
          </div>
          <div className="sm:text-right">
            <div className="text-xs uppercase tracking-wider text-zinc-400">Ship To</div>
            <div className="mt-1 font-medium text-zinc-900">{warehouseName ?? "—"}</div>
            {warehouseAddress && (
              <div className="whitespace-pre-line text-sm text-zinc-500">
                {warehouseAddress}
              </div>
            )}
            {warehousePhone && (
              <div className="text-sm text-zinc-500">{warehousePhone}</div>
            )}
          </div>
        </div>

        <div className="mt-4 text-sm text-zinc-500">
          Issued: {fmtDate(po.issuedDate)} · ETA: {fmtDate(po.expectedDeliveryDate)} · Status:{" "}
          {STATUS_LABELS[po.status as keyof typeof STATUS_LABELS] ?? po.status}
        </div>
        {supplierStages.length > 0 && (
          <div className="mt-2 text-sm text-zinc-600">
            <span className="font-medium text-zinc-900">Your stages:</span>{" "}
            {supplierStages.join(", ")}
          </div>
        )}

        {summarize ? (
          <>
            <p className="mt-6 mb-2 text-sm text-zinc-600">
              Raw blanks to produce — grouped by size + material (colour/finish is
              added downstream, so it&apos;s irrelevant at this stage):
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Raw blank</TableHead>
                  <TableHead>Covers (finished SKUs)</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Supplier price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rawBlanks.map((g) => {
                  const unit = g.lineItemIds.length
                    ? supplierUnit.get(g.lineItemIds[0]) ?? null
                    : null;
                  return (
                    <TableRow key={g.label}>
                      <TableCell>
                        {supplierStages.length > 0 && (
                          <span className="font-semibold text-red-600">
                            {supplierStages.join(", ")} —{" "}
                          </span>
                        )}
                        <span className="font-medium text-zinc-900">{g.label}</span>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-400">
                        {g.skus.join(", ")}
                      </TableCell>
                      <TableCell className="text-right font-medium text-zinc-900">
                        {g.quantity}
                      </TableCell>
                      <TableCell className="text-right text-zinc-700">
                        {fmtMoney(unit != null ? unit * g.quantity : null)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="mt-4 flex items-baseline justify-end border-t border-zinc-100 pt-3">
              <span className="text-sm text-zinc-500">Total pieces</span>
              <span className="ml-3 text-base font-semibold text-zinc-900">
                {totalPieces}
              </span>
            </div>
            {supplierTotalCents > 0 && (
              <div className="mt-1 flex items-baseline justify-end">
                <span className="text-sm text-zinc-500">Supplier total</span>
                <span className="ml-3 text-base font-semibold text-zinc-900">
                  {fmtMoney(supplierTotalCents)}
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    {isSubPo ? (
                      <TableHead className="text-right">Supplier price</TableHead>
                    ) : (
                      <>
                        <TableHead className="text-right">Unit cost</TableHead>
                        <TableHead className="text-right">Line total</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((li) => {
                    const unit = isSubPo ? supplierUnit.get(li.id) ?? null : li.unitCostCents;
                    return (
                      <TableRow key={li.id}>
                        <TableCell className="font-mono text-xs">{li.sku}</TableCell>
                        <TableCell>
                          {supplierStages.length > 0 && (
                            <span className="font-semibold text-red-600">
                              {supplierStages.join(", ")} —{" "}
                            </span>
                          )}
                          {li.title}
                        </TableCell>
                        <TableCell className="text-right text-zinc-500">{li.quantity}</TableCell>
                        {isSubPo ? (
                          <TableCell className="text-right text-zinc-700">
                            {fmtMoney(unit != null ? unit * li.quantity : null)}
                          </TableCell>
                        ) : (
                          <>
                            <TableCell className="text-right text-zinc-500">
                              {fmtMoney(li.unitCostCents)}
                            </TableCell>
                            <TableCell className="text-right text-zinc-700">
                              {fmtMoney(
                                li.unitCostCents != null
                                  ? li.unitCostCents * li.quantity
                                  : null,
                              )}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex items-baseline justify-end border-t border-zinc-100 pt-3">
              <span className="text-sm text-zinc-500">
                {isSubPo ? "Supplier total" : "Total"}
              </span>
              <span className="ml-3 text-base font-semibold text-zinc-900">
                {isSubPo ? fmtMoney(supplierTotalCents) : fmtMoney(total)}
              </span>
            </div>
          </>
        )}

        {po.notes && <p className="mt-6 text-sm text-zinc-600">{po.notes}</p>}
      </div>
    </div>
  );
}
