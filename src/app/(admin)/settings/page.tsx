import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { customer, order, orderLineItem } from "@/lib/schema";
import { count, max } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Settings | Fitwell Admin",
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const [customerStats, orderStats, lineItemStats, lastOrder, lastCustomer] =
    await Promise.all([
      db.select({ count: count() }).from(customer),
      db.select({ count: count() }).from(order),
      db.select({ count: count() }).from(orderLineItem),
      db.select({ latest: max(order.processedAt) }).from(order),
      db.select({ latest: max(customer.updatedAt) }).from(customer),
    ]);

  const adminEmails = process.env.ADMIN_EMAILS ?? "Not configured";
  const customerCount = customerStats[0]?.count ?? 0;
  const orderCount = orderStats[0]?.count ?? 0;
  const lineItemCount = lineItemStats[0]?.count ?? 0;
  const lastOrderDate = lastOrder[0]?.latest;
  const lastCustomerDate = lastCustomer[0]?.latest;

  return (
    <div>
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Admin configuration and sync status
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Admin Access</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-zinc-500">Allowed Emails</dt>
                <dd className="font-mono text-xs">{adminEmails}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Shopify Store</dt>
                <dd className="font-mono text-xs">
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
