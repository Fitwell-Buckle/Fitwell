import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { company, invoice } from "@/lib/schema";
import { getCompanyScope } from "@/lib/portal/company-session";
import {
  getCatalogCached,
  getCatalogGroupsCached,
  allowedVariantIds,
  type CatalogVariant,
  type CatalogCollectionGroup,
} from "@/lib/catalog/load";
import {
  INVOICE_STATUS_LABELS,
  invoiceStatusBadgeClass,
  type InvoiceStatus,
} from "@/lib/invoicing/invoicing";
import { fmtMoney, fmtDate } from "@/lib/production/display";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { CatalogCollection } from "@/components/catalog/product-combobox";
import { PortalOrder, type InitialItem } from "../../portal-order";

export default async function PortalOrderEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const scope = await getCompanyScope();
  if (!scope) redirect("/portal/login");

  const { id } = await params;

  const [inv, comp, catalog, groups] = await Promise.all([
    db.query.invoice.findFirst({
      where: eq(invoice.id, id),
      with: { lineItems: true },
    }),
    db.query.company.findFirst({
      where: eq(company.id, scope.companyId),
      columns: {
        name: true,
        assignedCollectionIds: true,
        assignedProductIds: true,
        allowWirePayment: true,
      },
      with: { priceTier: { columns: { name: true, discountPercent: true } } },
    }),
    (async (): Promise<CatalogVariant[]> => {
      try {
        return await getCatalogCached();
      } catch {
        return [];
      }
    })(),
    (async (): Promise<CatalogCollectionGroup[]> => {
      try {
        return await getCatalogGroupsCached();
      } catch {
        return [];
      }
    })(),
  ]);

  // Only the owning company may open its order.
  if (!inv || inv.companyId !== scope.companyId) notFound();

  const discount = comp?.priceTier?.discountPercent ?? 0;
  const status = inv.status as InvoiceStatus;
  const editable = status === "draft" || status === "sent";

  const initialItems: InitialItem[] = inv.lineItems
    .filter((l) => l.shopifyVariantId)
    .map((l) => ({
      shopifyProductId: l.shopifyProductId,
      shopifyVariantId: l.shopifyVariantId as string,
      sku: l.sku,
      title: l.title,
      unitPriceCents: l.unitPriceCents,
      quantity: l.quantity,
    }));

  const header = (
    <div className="flex flex-wrap items-center gap-3">
      <PageHeader title={`Order ${inv.invoiceNumber}`} />
      <Badge className={invoiceStatusBadgeClass(status)}>
        {INVOICE_STATUS_LABELS[status] ?? status}
      </Badge>
    </div>
  );

  // Paid / void orders are locked — show a read-only summary.
  if (!editable) {
    return (
      <div>
        {header}
        <Card className="mt-6 p-6">
          <div className="space-y-2">
            {inv.lineItems.map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-100 px-3 py-2 text-sm"
              >
                <span className="min-w-[200px] flex-1 text-zinc-800">
                  {l.sku ? `${l.sku} · ${l.title}` : l.title}
                </span>
                <span className="text-zinc-500">×{l.quantity}</span>
                <span className="w-24 text-right font-medium text-zinc-900">
                  {fmtMoney(l.unitPriceCents * l.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end border-t border-zinc-100 pt-3 text-base font-semibold text-zinc-900">
            <span className="mr-6">Total</span>
            <span className="w-28 text-right">{fmtMoney(inv.totalCents)}</span>
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            Issued {fmtDate(inv.issuedDate)}. This order is {INVOICE_STATUS_LABELS[status] ?? status}
            {status === "paid" ? " and can no longer be edited." : "."}
          </p>
        </Card>
      </div>
    );
  }

  // Editable (draft or sent/unpaid): restrict the picker to the brand's catalog,
  // same as the new-order page.
  const allowed = allowedVariantIds({
    assignedCollectionIds: comp?.assignedCollectionIds,
    assignedProductIds: comp?.assignedProductIds,
    groups,
    catalog,
  });
  const visibleCatalog = allowed
    ? catalog.filter((v) => allowed.has(v.shopifyVariantId))
    : catalog;
  const visibleIds = new Set(visibleCatalog.map((v) => v.shopifyVariantId));
  const collections: CatalogCollection[] = groups
    .map((g) => ({
      id: g.id,
      title: g.title,
      variantIds: new Set(g.variantIds.filter((vid) => visibleIds.has(vid))),
    }))
    .filter((c) => c.variantIds.size > 0);

  return (
    <div>
      {header}
      <p className="mt-1 text-sm text-zinc-500">
        {status === "draft"
          ? "Draft — not submitted yet. Edit the items, then save or submit for payment."
          : "Submitted but unpaid — edit the items and save to update your order and payment link."}
      </p>
      <PortalOrder
        variants={visibleCatalog}
        collections={collections}
        discountPercent={discount}
        allowWirePayment={comp?.allowWirePayment ?? false}
        orderId={inv.id}
        status={status === "draft" ? "draft" : "sent"}
        paymentMethod={(inv.paymentMethod as "card" | "wire") ?? "card"}
        initialItems={initialItems}
      />
    </div>
  );
}
