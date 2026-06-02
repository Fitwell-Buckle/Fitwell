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
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Mono, Muted } from "@/components/ui/data-table";
import { MetricCard } from "@/components/charts/metric-card";
import { InboundMessages } from "@/components/crm/inbound-messages";

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
        className="text-sm text-zinc-400 hover:text-zinc-700"
      >
        &larr; Customers
      </Link>

      <div className="mt-3">
        <PageHeader
          title={`${cust.firstName ?? ""} ${cust.lastName ?? ""}`.trim() || "Unknown"}
        />
      </div>

      {ltv && (
        <div className="mt-6 grid gap-5 sm:grid-cols-4">
          <MetricCard label="Total Spent" value={fmt(ltv.totalSpent)} />
          <MetricCard label="Orders" value={String(ltv.orderCount)} />
          <MetricCard label="Avg Order Value" value={fmt(ltv.avgOrderValue)} />
          <MetricCard
            label="Predicted Annual"
            value={fmt(ltv.predictedAnnualValue)}
          />
        </div>
      )}

      <InboundMessages
        emails={cust.email ? [cust.email] : []}
        relationship="customer"
        whatsapp={{ type: "customer", id: cust.id }}
      />

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Email
                </dt>
                <dd className="mt-0.5">{cust.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Phone
                </dt>
                <dd className="mt-0.5">{cust.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Tags
                </dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {cust.tags && cust.tags.length > 0
                    ? cust.tags.map((t) => <Badge key={t}>{t}</Badge>)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Member Since
                </dt>
                <dd className="mt-0.5">
                  {cust.createdAt
                    ? cust.createdAt.toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attribution</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  UTM Source
                </dt>
                <dd className="mt-0.5">{cust.utmSource ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  UTM Medium
                </dt>
                <dd className="mt-0.5">{cust.utmMedium ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  UTM Campaign
                </dt>
                <dd className="mt-0.5">{cust.utmCampaign ?? "—"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Order History</CardTitle>
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
              {!cust.orders || cust.orders.length === 0 ? (
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
                    <TableCell>
                      <Muted>{o.shopifyOrderNumber}</Muted>
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {o.processedAt
                        ? o.processedAt.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Mono>{fmt(o.totalPrice ?? 0)}</Mono>
                    </TableCell>
                    <TableCell>
                      <Badge>{o.financialStatus ?? "—"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge>{o.fulfillmentStatus ?? "unfulfilled"}</Badge>
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
