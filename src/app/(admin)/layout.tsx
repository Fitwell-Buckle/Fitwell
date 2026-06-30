import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { auth } from "@/lib/auth";
import { AdminSidebar, SidebarProvider } from "@/components/layout/admin-sidebar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { BreadcrumbProvider } from "@/components/layout/breadcrumb-context";
import { MobileHeader } from "@/components/layout/mobile-header";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { PosthogAdminIdentify } from "@/components/providers/posthog-admin-identify";
import { StageLabelsProvider } from "@/components/production/stage-labels-provider";
import { getStoreLogoUrl } from "@/lib/shopify/brand";
import { getStageLabels, getStageOrder } from "@/lib/production/stage-labels";
import { ShippingCostReminder } from "@/components/shipping/shipping-cost-reminder";
import {
  getShippingImportStatus,
  daysSince,
  shouldSeeShippingReminder,
} from "@/lib/shipping/import-status";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  // The weekly upload nag is scoped to whoever owns exporting the bill (Tom).
  const showShippingReminder = shouldSeeShippingReminder(session.user.email);

  const [logoUrl, stageLabels, stageOrder, shippingStatus] = await Promise.all([
    getStoreLogoUrl(),
    getStageLabels(),
    getStageOrder(),
    showShippingReminder ? getShippingImportStatus() : Promise.resolve(null),
  ]);

  return (
    <AuthSessionProvider>
      <RegisterServiceWorker />
      {session.user.email && (
        <PosthogAdminIdentify email={session.user.email} />
      )}
      <StageLabelsProvider labels={stageLabels} order={stageOrder}>
      <SidebarProvider>
        <div className="flex h-screen print:block print:h-auto">
          <div className="print:hidden">
            <AdminSidebar logoUrl={logoUrl} />
          </div>
          <div className="flex flex-1 flex-col overflow-hidden print:overflow-visible">
            <div className="print:hidden">
              <Suspense>
                <MobileHeader />
              </Suspense>
            </div>
            {shippingStatus && (
              <div className="print:hidden">
                <ShippingCostReminder
                  daysSince={daysSince(shippingStatus.lastImportedAt, new Date())}
                  lastImportedAt={shippingStatus.lastImportedAt?.toISOString() ?? null}
                />
              </div>
            )}
            <main className="flex-1 overflow-auto bg-[#fafafa] px-4 py-8 md:px-10 print:overflow-visible print:bg-white print:p-0">
              <BreadcrumbProvider>
                <Breadcrumbs />
                {children}
              </BreadcrumbProvider>
            </main>
          </div>
        </div>
        <Toaster richColors position="top-center" />
      </SidebarProvider>
      </StageLabelsProvider>
    </AuthSessionProvider>
  );
}
