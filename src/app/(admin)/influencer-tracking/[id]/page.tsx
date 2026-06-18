import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getInfluencerOrderDetail } from "@/lib/influencer/service";
import {
  INFLUENCER_ORDER_STATUS_LABELS,
  influencerOrderStatusBadgeClass,
  type InfluencerOrderStatus,
} from "@/lib/influencer/influencer";
import { PageHeader } from "@/components/ui/page-header";
import { InvoiceAttachments } from "@/components/invoicing/invoice-attachments";
import {
  InfluencerOrderEditForm,
  type EditOrderInitial,
} from "./order-edit-form";

export const metadata: Metadata = {
  title: "Gifting order | Fitwell Admin",
};

export default async function InfluencerOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;
  const order = await getInfluencerOrderDetail(id);
  if (!order) notFound();

  const status = order.status as InfluencerOrderStatus;

  const initial: EditOrderInitial = {
    lineItems: order.lineItems.map((l) => ({
      sku: l.sku,
      title: l.title,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      shopifyProductId: l.shopifyProductId,
      shopifyVariantId: l.shopifyVariantId,
      addressId: l.shipTo?.addressId ?? null,
    })),
    shipToAddressId: order.shipTo?.addressId ?? null,
    contentDueDate: order.contentDueDate,
    publishedAt: order.publishedAt,
    affiliateLink: order.affiliateLink,
    status,
    expectedPlatform:
      (order.expectedPlatform as EditOrderInitial["expectedPlatform"]) ?? null,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    shippedAt: order.shippedAt ? order.shippedAt.toISOString().slice(0, 10) : null,
    deliveredAt: order.deliveredAt ? order.deliveredAt.toISOString().slice(0, 10) : null,
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <PageHeader title={order.orderNumber} />
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${influencerOrderStatusBadgeClass(status)}`}
        >
          {INFLUENCER_ORDER_STATUS_LABELS[status] ?? status}
        </span>
      </div>

      <InfluencerOrderEditForm
        orderId={order.id}
        orderNumber={order.orderNumber}
        influencerName={order.influencer?.name ?? "—"}
        assignedCollectionIds={order.influencer?.assignedCollectionIds ?? []}
        addresses={order.addresses}
        initial={initial}
      />

      <InvoiceAttachments
        uploadUrl={`/api/influencer-orders/${order.id}/attachments`}
        deleteUrlBase="/api/influencer-orders/attachments"
        attachments={order.attachments.map((a) => ({
          id: a.id,
          blobUrl: a.blobUrl,
          filename: a.filename,
          sizeBytes: a.sizeBytes,
        }))}
        title="Gifting documents"
        buttonLabel="Attach file"
        hint="Attach the gifting agreement, content brief, or related documents (PDF/image). Max 10MB."
      />
    </div>
  );
}
