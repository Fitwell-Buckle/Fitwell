import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getPoDetail } from "@/lib/production/service";
import { getShopifyClient } from "@/lib/shopify/client";
import { getStoreLogoUrl } from "@/lib/shopify/brand";
import { fmtMoney, fmtDate, STATUS_LABELS, skuSize } from "@/lib/production/display";
import { STAGE_LABELS, STAGES } from "@/lib/production/stages";
import { formatPoNumber, planSubPos } from "@/lib/production/sub-po";
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
  let supplierStages: string[] = [];
  if (master) {
    const plan = planSubPos(
      STAGES.filter((s) => s !== "complete"),
      master.stageAssignments,
      master.supplierId,
    );
    supplierStages = (plan.find((p) => p.supplierId === po.supplierId)?.stages ?? []).map(
      (s) => STAGE_LABELS[s],
    );
  }

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

        <div className="mt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead className="text-right">Line total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((li) => (
                <TableRow key={li.id}>
                  <TableCell className="font-mono text-xs">{li.sku}</TableCell>
                  <TableCell>{li.title}</TableCell>
                  <TableCell className="text-right text-zinc-500">{li.quantity}</TableCell>
                  <TableCell className="text-right text-zinc-500">
                    {fmtMoney(li.unitCostCents)}
                  </TableCell>
                  <TableCell className="text-right text-zinc-700">
                    {fmtMoney(
                      li.unitCostCents != null ? li.unitCostCents * li.quantity : null,
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex items-baseline justify-end border-t border-zinc-100 pt-3">
          <span className="text-sm text-zinc-500">Total</span>
          <span className="ml-3 text-base font-semibold text-zinc-900">
            {fmtMoney(total)}
          </span>
        </div>

        {po.notes && <p className="mt-6 text-sm text-zinc-600">{po.notes}</p>}
      </div>
    </div>
  );
}
