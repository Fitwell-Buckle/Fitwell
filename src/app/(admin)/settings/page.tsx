import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  customer,
  order,
  orderLineItem,
  priceTier,
  productionPoLineItem,
} from "@/lib/schema";
import { asc, count, max } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getBillingSettings } from "@/lib/invoicing/billing-settings";
import { getFollowupSettings } from "@/lib/crm/followup-settings";
import { getProductionSettings } from "@/lib/production/production-settings";
import { getDashboardSettings } from "@/lib/dashboard/settings";
import { getStages } from "@/lib/production/stage-labels";
import { WireInfoSetup } from "@/app/(admin)/invoices/wire-info-setup";
import { StageSetup } from "@/app/(admin)/modules/production/stage-setup";
import { PriceTiersManager } from "@/components/production/price-tiers-manager";
import { LeadFollowupSettings } from "./lead-followup-settings";
import { EtaReminderSettings } from "./eta-reminder-settings";
import { StageCheckinSettings } from "./stage-checkin-settings";
import { PushNotificationSettings } from "./push-notification-settings";
import { DashboardSettings } from "./dashboard-settings";

export const metadata: Metadata = {
  title: "Settings | Fitwell Admin",
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const [
    customerStats,
    orderStats,
    lineItemStats,
    lastOrder,
    lastCustomer,
    billing,
    stages,
    stageCountRows,
    priceTiers,
    followup,
    productionSettings,
    dashboard,
  ] = await Promise.all([
    db.select({ count: count() }).from(customer),
    db.select({ count: count() }).from(order),
    db.select({ count: count() }).from(orderLineItem),
    db.select({ latest: max(order.processedAt) }).from(order),
    db.select({ latest: max(customer.updatedAt) }).from(customer),
    getBillingSettings(),
    getStages(),
    db
      .select({
        stage: productionPoLineItem.currentStage,
        n: count(),
      })
      .from(productionPoLineItem)
      .groupBy(productionPoLineItem.currentStage),
    db.query.priceTier.findMany({ orderBy: asc(priceTier.name) }),
    getFollowupSettings(),
    getProductionSettings(),
    getDashboardSettings(),
  ]);

  const stageCounts: Record<string, number> = {};
  for (const r of stageCountRows) stageCounts[r.stage] = r.n;

  const adminEmails = process.env.ADMIN_EMAILS ?? "Not configured";
  const customerCount = customerStats[0]?.count ?? 0;
  const orderCount = orderStats[0]?.count ?? 0;
  const lineItemCount = lineItemStats[0]?.count ?? 0;
  const lastOrderDate = lastOrder[0]?.latest;
  const lastCustomerDate = lastCustomer[0]?.latest;

  return (
    <div>
      <PageHeader title="Settings" />

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Wire transfer details</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-zinc-500">
              Bank-wire remittance instructions shown on every B2B invoice
              (print + email).
            </p>
            <WireInfoSetup initialWireInfo={billing?.instructions ?? ""} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Production stages</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-zinc-500">
              Add, rename, reorder, or remove the production pipeline stages.
            </p>
            <StageSetup
              stages={stages.map((s) => ({ key: s.key, label: s.label }))}
              counts={stageCounts}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Supplier ETA reminders</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-zinc-500">
              Nudge suppliers by email until they set a Final ETA on every line
              item they own.
            </p>
            <EtaReminderSettings initial={productionSettings} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Stage check-ins</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-zinc-500">
              Positive control — prompt suppliers to confirm each stage is on
              track at set points through its estimated time.
            </p>
            <StageCheckinSettings initial={productionSettings} />
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Push notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-zinc-500">
              Get the same alerts as the in-app inbox pushed to this device —
              new B2B orders, lead replies, production handoffs, and more.
              Enable per device; on iPhone, add the app to your home screen
              first.
            </p>
            <PushNotificationSettings />
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Lead follow-ups</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-zinc-500">
              Automatic follow-up rules. More (AI-suggested) are coming soon.
            </p>
            <LeadFollowupSettings initial={followup} />
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Returns</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-zinc-500">
              The assumed shipping-label cost per return, used by the
              dashboard&apos;s Avg Return Value tile.
            </p>
            <DashboardSettings initial={dashboard} />
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Price tiers</CardTitle>
          </CardHeader>
          <CardContent>
            <PriceTiersManager
              priceTiers={priceTiers.map((t) => ({
                id: t.id,
                name: t.name,
                discountPercent: t.discountPercent,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Admin Access</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-zinc-500">Allowed Emails</dt>
                <dd className="text-xs">{adminEmails}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Shopify Store</dt>
                <dd className="text-xs">
                  {process.env.SHOPIFY_STORE_DOMAIN ?? "Not configured"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Database Records</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Customers</dt>
                <dd className="font-semibold">{customerCount.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Orders</dt>
                <dd className="font-semibold">{orderCount.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Line Items</dt>
                <dd className="font-semibold">{lineItemCount.toLocaleString()}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Last Sync</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-zinc-500">Most Recent Order</dt>
                <dd>
                  {lastOrderDate
                    ? lastOrderDate.toLocaleString("en-US")
                    : "No orders synced"}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Most Recent Customer Update</dt>
                <dd>
                  {lastCustomerDate
                    ? lastCustomerDate.toLocaleString("en-US")
                    : "No customers synced"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
