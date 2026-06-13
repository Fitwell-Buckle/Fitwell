import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { company } from "@/lib/schema";
import { getCompanyScope } from "@/lib/portal/company-session";
import { getCompanyAddresses } from "@/lib/portal/addresses";
import { getInvoiceDetail } from "@/lib/invoicing/service";
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
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CatalogCollection } from "@/components/catalog/product-combobox";
import { PortalOrder, type InitialItem } from "../../portal-order";
import { InvoiceDocument } from "@/app/(admin)/invoices/[id]/invoice-document";
import { PrintButton } from "@/app/(admin)/invoices/[id]/print/print-button";

export default async function PortalOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const scope = await getCompanyScope();
  if (!scope) redirect("/portal/login");

  const { id } = await params;
  const { edit } = await searchParams;

  const inv = await getInvoiceDetail(id);
  // Only the owning company may open its order.
  if (!inv || inv.companyId !== scope.companyId) notFound();

  const status = inv.status as InvoiceStatus;
  // Drafts always open in the editor; a sent (unpaid) order opens as the invoice
  // document but can be edited via "Edit order" (?edit=1); paid/void are locked.
  const showEditor = status === "draft" || (status === "sent" && edit === "1");

  // ── Invoice document (submitted orders) ── the same printable invoice the
  // admin uses: From/Bill-to, line items, totals, pay link + bank-wire info,
  // with Print / Save PDF.
  if (!showEditor) {
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href="/portal/orders" className="text-sm text-zinc-500 hover:text-zinc-900">
            ← Your orders
          </Link>
          <div className="flex gap-2">
            {status === "sent" && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/portal/orders/${id}?edit=1`}>Edit order</Link>
              </Button>
            )}
            <PrintButton />
          </div>
        </div>
        <InvoiceDocument inv={inv} />
      </div>
    );
  }

  // ── Editor (draft, or a sent order being edited) ──
  const [comp, catalog, groups, addresses] = await Promise.all([
    db.query.company.findFirst({
      where: eq(company.id, scope.companyId),
      columns: {
        assignedCollectionIds: true,
        assignedProductIds: true,
        allowWirePayment: true,
      },
      with: { priceTier: { columns: { discountPercent: true } } },
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
    getCompanyAddresses(scope.companyId),
  ]);

  const discount = comp?.priceTier?.discountPercent ?? 0;
  const initialItems: InitialItem[] = inv.lineItems
    .filter((l) => l.shopifyVariantId)
    .map((l) => ({
      shopifyProductId: l.shopifyProductId,
      shopifyVariantId: l.shopifyVariantId as string,
      sku: l.sku,
      title: l.title,
      unitPriceCents: l.unitPriceCents,
      quantity: l.quantity,
      addressId: l.shipTo?.addressId ?? undefined,
    }));

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
      <div className="flex flex-wrap items-center gap-3">
        <PageHeader title={`Order ${inv.invoiceNumber}`} />
        <Badge className={invoiceStatusBadgeClass(status)}>
          {INVOICE_STATUS_LABELS[status] ?? status}
        </Badge>
      </div>
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
        addresses={addresses}
        initialAddressId={inv.shipTo?.addressId ?? undefined}
        orderId={inv.id}
        status={status === "draft" ? "draft" : "sent"}
        paymentMethod={(inv.paymentMethod as "card" | "wire") ?? "card"}
        initialItems={initialItems}
      />
    </div>
  );
}
