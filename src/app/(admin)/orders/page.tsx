import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { order, customer, orderLineItem } from "@/lib/schema";
import { desc, eq, and, gte, lte, count, exists, inArray } from "drizzle-orm";
import { parseDateRange } from "@/lib/date-range";
import { ListFilters } from "@/components/catalog/list-filters";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { SectionTabs } from "@/components/ui/section-tabs";
import { ORDERS_TABS } from "@/lib/nav-tabs";
import { Badge } from "@/components/ui/badge";
import { DataTable, Mono, Muted } from "@/components/ui/data-table";

export const metadata: Metadata = {
  title: "Consumer Orders | Fitwell Admin",
};

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  const status = typeof params.status === "string" ? params.status : undefined;
  const { from, to } = parseDateRange(params);
  // Item Chooser filter: the chosen product SKU(s) (comma-separated in the URL).
  const skus = (typeof params.sku === "string" ? params.sku : "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const conditions = [];
  if (status) {
    conditions.push(eq(order.financialStatus, status));
  }
  conditions.push(gte(order.processedAt, from));
  conditions.push(lte(order.processedAt, to));
  // Keep orders containing a chosen product (preserves SQL pagination).
  if (skus.length > 0) {
    conditions.push(
      exists(
        db
          .select({ one: orderLineItem.id })
          .from(orderLineItem)
          .where(
            and(eq(orderLineItem.orderId, order.id), inArray(orderLineItem.sku, skus)),
          ),
      ),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [orders, totalResult] = await Promise.all([
    db
      .select({
        id: order.id,
        shopifyOrderNumber: order.shopifyOrderNumber,
        totalPrice: order.totalPrice,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        processedAt: order.processedAt,
        customerFirstName: customer.firstName,
        customerLastName: customer.lastName,
        customerEmail: customer.email,
        customerId: order.customerId,
      })
      .from(order)
      .leftJoin(customer, eq(order.customerId, customer.id))
      .where(where)
      .orderBy(desc(order.processedAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(order).where(where),
  ]);

  const total = totalResult[0]?.count ?? 0;

  // Line items for the current page (one extra query, cheap — capped at `limit`
  // orders). Aggregated in JS into a {qty, skus[]} per order for the row render.
  const pageOrderIds = orders.map((o) => o.id);
  const lines =
    pageOrderIds.length > 0
      ? await db
          .select({
            orderId: orderLineItem.orderId,
            sku: orderLineItem.sku,
            quantity: orderLineItem.quantity,
          })
          .from(orderLineItem)
          .where(inArray(orderLineItem.orderId, pageOrderIds))
      : [];
  const linesByOrder = new Map<string, { qty: number; skus: string[] }>();
  for (const l of lines) {
    const cur = linesByOrder.get(l.orderId) ?? { qty: 0, skus: [] };
    cur.qty += l.quantity ?? 0;
    if (l.sku) cur.skus.push(l.sku);
    linesByOrder.set(l.orderId, cur);
  }
  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <PageHeader title="Orders" />
      <SectionTabs tabs={ORDERS_TABS} />

      <div className="mt-6" />
      <ListFilters />

      <form action="" method="GET" className="mt-4 flex gap-2 items-center">
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300"
        >
          <option value="">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="refunded">Refunded</option>
          <option value="partially_refunded">Partially Refunded</option>
          <option value="voided">Voided</option>
        </select>
        {/* Preserve the date range + catalog filters when filtering by status. */}
        {Object.entries(params).map(([k, v]) =>
          typeof v === "string" && k !== "status" && k !== "page" ? (
            <input key={k} type="hidden" name={k} value={v} />
          ) : null,
        )}
        <Button type="submit">Filter</Button>
        {status && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/orders">Clear</Link>
          </Button>
        )}
      </form>

      <DataTable className="mt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>SKUs</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Financial Status</TableHead>
              <TableHead>Fulfillment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-zinc-400"
                >
                  {status
                    ? "No orders match that filter."
                    : "No orders yet. Run the Shopify sync to populate data."}
                </TableCell>
              </TableRow>
            ) : (
              orders.map((o) => {
                const li = linesByOrder.get(o.id) ?? { qty: 0, skus: [] };
                const skuList = li.skus.join(", ");
                return (
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
                    {o.customerId ? (
                      <Link
                        href={`/customers/${o.customerId}`}
                        className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                      >
                        {o.customerFirstName} {o.customerLastName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right text-zinc-500">
                    {li.qty}
                  </TableCell>
                  <TableCell
                    className="max-w-xs font-mono text-xs text-zinc-500"
                    title={skuList}
                  >
                    <div className="truncate">{skuList || "—"}</div>
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
                );
              })
            )}
          </TableBody>
        </Table>
      </DataTable>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Page {page} of {totalPages} ({total} orders)
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/orders?page=${page - 1}${status ? `&status=${encodeURIComponent(status)}` : ""}`}
                >
                  Previous
                </Link>
              </Button>
            )}
            {page < totalPages && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/orders?page=${page + 1}${status ? `&status=${encodeURIComponent(status)}` : ""}`}
                >
                  Next
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
