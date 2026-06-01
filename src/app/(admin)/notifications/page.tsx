import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listAdminNotifications } from "@/lib/production/notifications";
import { PageHeader } from "@/components/ui/page-header";
import { NotificationList } from "@/components/production/notification-list";

export const metadata: Metadata = {
  title: "Notifications | Fitwell Admin",
};

export default async function NotificationsPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");
  if (session.user.role === "supplier") redirect("/supplier");
  if (session.user.role === "company") redirect("/portal");

  const items = (await listAdminNotifications(50)).map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    poId: n.poId,
    leadId: n.leadId,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: (n.createdAt ?? new Date()).toISOString(),
  }));

  return (
    <div>
      <PageHeader title="Notifications" />
      <p className="mt-1 text-sm text-zinc-500">
        Production handoffs, drafted lead follow-ups, and other alerts.
      </p>
      <NotificationList
        items={items}
        apiPath="/api/notifications"
        poHrefBase="/modules/production/po"
        leadHrefBase="/leads"
      />
    </div>
  );
}
