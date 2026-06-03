import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatPoNumber } from "@/lib/production/sub-po";

// Wholesale orders (Shopify orders placed by the company's linked customers) and
// any purchase orders routed to this B2B company. Read-only history on the
// company detail page.

export interface CompanyOrderRow {
  id: string;
  number: number | null;
  processedAt: Date | null;
  totalCents: number | null;
  currency: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  customerName: string | null;
}

export interface CompanyPoRow {
  id: string;
  poNumber: string;
  issuedDate: string | null;
  expectedDeliveryDate: string | null;
  status: string;
  supplierName: string | null;
}

export interface CompanyInvoiceRow {
  id: string;
  invoiceNumber: string;
  status: string;
  totalCents: number | null;
  currency: string | null;
  issuedDate: string | null;
}

function money(cents: number | null, currency: string | null): string {
  const v = (cents ?? 0) / 100;
  try {
    return v.toLocaleString("en-US", {
      style: "currency",
      currency: currency || "USD",
    });
  } catch {
    return `$${v.toFixed(2)}`;
  }
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(dt.getTime())
    ? String(d)
    : dt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

const statusPill =
  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

export function CompanyHistory({
  orders,
  pos,
  invoices,
}: {
  orders: CompanyOrderRow[];
  pos: CompanyPoRow[];
  invoices: CompanyInvoiceRow[];
}) {
  return (
    <>
      {invoices.length > 0 && (
        <Card className="mt-5 p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Invoices</h2>
            <p className="text-xs text-zinc-400">B2B invoices raised in-platform</p>
          </div>
          <ul className="mt-4 divide-y divide-zinc-100">
            {invoices.map((iv) => (
              <li
                key={iv.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <Link
                    href={`/invoices/${iv.id}`}
                    className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                  >
                    {iv.invoiceNumber}
                  </Link>
                  <span className="ml-2 text-zinc-400">
                    {fmtDate(iv.issuedDate)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`${statusPill} bg-zinc-100 text-zinc-600`}>
                    {iv.status}
                  </span>
                  <span className="font-medium text-zinc-900">
                    {money(iv.totalCents, iv.currency)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-5 p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Order history</h2>
          <p className="text-xs text-zinc-400">
            Shopify orders from this customer&apos;s linked people
          </p>
        </div>
        {orders.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">
            No orders linked to this customer yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100">
            {orders.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium text-zinc-900">
                    {o.number ? `#${o.number}` : "Order"}
                  </span>
                  <span className="ml-2 text-zinc-400">
                    {fmtDate(o.processedAt)}
                  </span>
                  {o.customerName && (
                    <span className="ml-2 truncate text-xs text-zinc-500">
                      {o.customerName}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {o.financialStatus && (
                    <span className={`${statusPill} bg-zinc-100 text-zinc-600`}>
                      {o.financialStatus}
                    </span>
                  )}
                  <span className="font-medium text-zinc-900">
                    {money(o.totalCents, o.currency)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {pos.length > 0 && (
        <Card className="mt-5 p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">PO history</h2>
            <p className="text-xs text-zinc-400">
              Purchase orders routed to this customer
            </p>
          </div>
          <ul className="mt-4 divide-y divide-zinc-100">
            {pos.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <Link
                    href={`/modules/production/po/${p.id}`}
                    className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                  >
                    {formatPoNumber(p.poNumber)}
                  </Link>
                  <span className="ml-2 text-zinc-400">
                    issued {fmtDate(p.issuedDate)}
                  </span>
                  {p.supplierName && (
                    <span className="ml-2 text-xs text-zinc-500">
                      {p.supplierName}
                    </span>
                  )}
                </div>
                <span className={`${statusPill} bg-zinc-100 text-zinc-600`}>
                  {p.status}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
