import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getCustomerById } from "@/lib/admin/customers";
import { calculateCustomerLTV } from "@/lib/analytics/ltv";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Customer Detail | Fitwell Admin",
};

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;
  const cust = await getCustomerById(id);
  if (!cust) notFound();

  const ltv = await calculateCustomerLTV(id);

  return (
    <div>
      <Link
        href="/customers"
        className="text-sm text-zinc-500 hover:text-zinc-900"
      >
        &larr; Back to customers
      </Link>

      <h1 className="mt-4 text-2xl font-bold">
        {cust.firstName} {cust.lastName}
      </h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-zinc-500">Email</dt>
                <dd>{cust.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Phone</dt>
                <dd>{cust.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Tags</dt>
                <dd>
                  {cust.tags && cust.tags.length > 0
                    ? cust.tags.join(", ")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Member Since</dt>
                <dd>
                  {cust.createdAt
                    ? cust.createdAt.toLocaleDateString("en-US")
                    : "—"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Lifetime Value</CardTitle>
          </CardHeader>
          <CardContent>
            {ltv ? (
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-zinc-500">Total Spent</dt>
                  <dd className="text-lg font-semibold">
                    {fmt(ltv.totalSpent)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Order Count</dt>
                  <dd>{ltv.orderCount}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Avg Order Value</dt>
                  <dd>{fmt(ltv.avgOrderValue)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Predicted Annual Value</dt>
                  <dd>{fmt(ltv.predictedAnnualValue)}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-zinc-400">No purchase data yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Order History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fulfillment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!cust.orders || cust.orders.length === 0) ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-zinc-400"
                  >
                    No orders found.
                  </TableCell>
                </TableRow>
              ) : (
                cust.orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">
                      #{o.shopifyOrderNumber}
                    </TableCell>
                    <TableCell>
                      {o.processedAt
                        ? o.processedAt.toLocaleDateString("en-US")
                        : "—"}
                    </TableCell>
                    <TableCell>{fmt(o.totalPrice ?? 0)}</TableCell>
                    <TableCell>{o.financialStatus ?? "—"}</TableCell>
                    <TableCell>
                      {o.fulfillmentStatus ?? "unfulfilled"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
