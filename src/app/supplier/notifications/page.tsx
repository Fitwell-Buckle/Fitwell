import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSupplierScope } from "@/lib/production/supplier-session";
import { listSupplierNotifications } from "@/lib/production/notifications";
import { PageHeader } from "@/components/ui/page-header";
import { NotificationList } from "@/components/production/notification-list";

export const metadata: Metadata = {
  title: "Notifications | Supplier Portal",
};

export default async function SupplierNotificationsPage() {
  const scope = await getSupplierScope();
  if (!scope) redirect("/supplier/login");

  const items = (await listSupplierNotifications(scope.supplierId, 50)).map(
    (n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      poId: n.poId,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: (n.createdAt ?? new Date()).toISOString(),
    }),
  );

  return (
    <div>
      <PageHeader title="Notifications" />
      <p className="mt-1 text-sm text-zinc-500">
        Notes and documents from Fitwell on your purchase orders.
      </p>
      <NotificationList
        items={items}
        apiPath="/api/supplier/notifications"
        poHrefBase="/supplier/po"
      />
    </div>
  );
}
