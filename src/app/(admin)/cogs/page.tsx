import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { parseDateRange } from "@/lib/date-range";
import { getCogs } from "@/lib/cogs/cogs";
import { getMarginByChannel, MARGIN_COVERAGE_THRESHOLD } from "@/lib/margin/true-margin";
import { ORDER_CHANNEL_LABELS } from "@/lib/orders/channel";
import { getShippingImportStatus } from "@/lib/shipping/import-status-query";
import { ShippingCostUploadButton } from "@/components/shipping/shipping-cost-upload-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, Mono, Muted } from "@/components/ui/data-table";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export const metadata: Metadata = {
  title: "COGS | Fitwell Admin",
};

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function pct(p: number | null) {
  return p == null ? "—" : `${p.toFixed(1)}%`;
}

export default async function CogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const { from, to } = parseDateRange(params);
  const { rows, totals, uncosted } = await getCogs({ from, to });

  // Contribution margin per channel (already in canonical channel order).
  const marginByChannel = await getMarginByChannel({ from, to });
  const shippingImport = await getShippingImportStatus();
  const marginBlended = marginByChannel.reduce(
    (a, r) => ({
      orders: a.orders + r.orders,
      revenue: a.revenue + r.revenueCents,
      cogs: a.cogs + r.cogsCents,
      costedRevenue: a.costedRevenue + r.costedRevenueCents,
      shipping: a.shipping + r.shippingCostCents,
      refunds: a.refunds + r.refundsCents,
      contribution: a.contribution + r.contributionCents,
    }),
    { orders: 0, revenue: 0, cogs: 0, costedRevenue: 0, shipping: 0, refunds: 0, contribution: 0 },
  );
  // Share of revenue we can actually attribute a product cost to. Until this is
  // meaningful, contribution/margin are withheld (a margin without COGS would
  // misrank channels — e.g. B2B, sold cheaper per unit, would read higher).
  const cogsCoverage =
    marginBlended.revenue > 0 ? marginBlended.costedRevenue / marginBlended.revenue : 0;

  const stats = [
    { label: "Revenue", value: fmt(totals.revenueCents) },
    { label: "COGS", value: fmt(totals.cogsCents) },
    { label: "Gross margin", value: fmt(totals.grossMarginCents) },
    { label: "Margin %", value: pct(totals.marginPct) },
  ];

  return (
    <div>
      <PageHeader title="COGS" />

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-500">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-zinc-900">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-3 text-xs text-zinc-500">
        Units sold in the selected range, valued at each SKU&apos;s
        quantity-weighted average cost from received (or prepaid) purchase orders,
        falling back to a per-material standard cost where no PO cost is
        recognized. Sample orders are excluded. Margin&nbsp;% is computed on costed
        revenue only.
      </p>
      {marginByChannel.length > 0 && uncosted.length === 0 ? (
        <p className="mt-1 text-xs text-zinc-400">
          (Standard cost: stainless buckle $3.60, titanium $4.50, tang $1.00,
          spring bar $0.01, bundle 3×. Recognized PO cost overrides it.)
        </p>
      ) : null}

      <DataTable className="mt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Avg Unit Cost</TableHead>
              <TableHead className="text-right">Units Sold</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">COGS</TableHead>
              <TableHead className="text-right">Gross Margin</TableHead>
              <TableHead className="text-right">Margin %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-zinc-400">
                  No sales in this range.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.sku}>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-zinc-600">
                    {r.sku}
                  </TableCell>
                  <TableCell className="font-medium text-zinc-900">
                    {r.title}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.avgUnitCostCents == null ? (
                      <Muted>—</Muted>
                    ) : (
                      <Mono>{fmt(r.avgUnitCostCents)}</Mono>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{r.unitsSold}</Mono>
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{fmt(r.revenueCents)}</Mono>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.cogsCents == null ? (
                      <Muted>no cost</Muted>
                    ) : (
                      <Mono>{fmt(r.cogsCents)}</Mono>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.grossMarginCents == null ? (
                      <Muted>—</Muted>
                    ) : (
                      <Mono>{fmt(r.grossMarginCents)}</Mono>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{pct(r.marginPct)}</Mono>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DataTable>

      {uncosted.length > 0 && (
        <p className="mt-3 text-xs text-amber-600">
          {uncosted.length} sold SKU{uncosted.length === 1 ? "" : "s"} have no
          purchase-order cost basis and are excluded from COGS/margin totals:{" "}
          {uncosted.map((u) => u.sku).join(", ")}
        </p>
      )}

      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            True margin by channel
          </h2>
          <ShippingCostUploadButton
            lastImportedAt={shippingImport.lastImportedAt?.toISOString() ?? null}
          />
        </div>
        <p className="mt-1 max-w-3xl text-xs text-zinc-500">
          Contribution = net product revenue − COGS − carrier shipping cost (what
          we paid, from Shopify billing) − refunds, per channel. Revenue is the
          order <strong>subtotal</strong> (after discounts) — so B2B/wholesale
          shows its true discounted price, not retail line prices. Channel: online
          store = D2C, POS = trade show, everything else (draft/wholesale/OEM) =
          B2B. COGS uses recognized production-PO cost where available, else a
          per-material standard cost (stainless $3.60 / titanium $4.50 buckle; tang
          $1.00; spring bar $0.01; bundle 3×). Margin % is withheld below{" "}
          {Math.round(MARGIN_COVERAGE_THRESHOLD * 100)}% COGS coverage. Samples
          excluded; payment fees and tax not included. Blended coverage:{" "}
          {Math.round(cogsCoverage * 100)}%.
        </p>
        <p className="mt-2 max-w-3xl rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <strong>B2B margin is approximate — caveat any B2B pull.</strong>{" "}
          Wholesale discounts sit at the order level and ~7% of B2B revenue is
          custom-money lines (tooling, deposits) with no product cost, so B2B
          margin is directional, not exact. <strong>D2C is the reliable channel</strong>
          {" "}and the focus for profitability/ROAS work.
        </p>

        {cogsCoverage < MARGIN_COVERAGE_THRESHOLD && (
          <p className="mt-3 max-w-3xl rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <strong>Low COGS coverage ({Math.round(cogsCoverage * 100)}%).</strong>{" "}
            Margin % is withheld for any channel below{" "}
            {Math.round(MARGIN_COVERAGE_THRESHOLD * 100)}% costed — showing it would
            overstate margin and could misrank channels.
          </p>
        )}

        <DataTable className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">COGS</TableHead>
                <TableHead className="text-right">Shipping</TableHead>
                <TableHead className="text-right">Refunds</TableHead>
                <TableHead className="text-right">Contribution</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {marginByChannel.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-zinc-400">
                    No orders in this range.
                  </TableCell>
                </TableRow>
              ) : (
                marginByChannel.map((r) => (
                  <TableRow key={r.channel}>
                    <TableCell className="font-medium text-zinc-900">
                      {ORDER_CHANNEL_LABELS[r.channel]}
                    </TableCell>
                    <TableCell className="text-right">
                      <Mono>{r.orders}</Mono>
                    </TableCell>
                    <TableCell className="text-right">
                      <Mono>{fmt(r.revenueCents)}</Mono>
                    </TableCell>
                    <TableCell className="text-right">
                      <Mono>{fmt(r.cogsCents)}</Mono>
                    </TableCell>
                    <TableCell className="text-right">
                      <Mono>{fmt(r.shippingCostCents)}</Mono>
                    </TableCell>
                    <TableCell className="text-right">
                      <Mono>{fmt(r.refundsCents)}</Mono>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.costedRevenueCents > 0 ? (
                        <Mono>{fmt(r.contributionCents)}</Mono>
                      ) : (
                        <Muted>—</Muted>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.marginPct == null ? (
                        <Muted>—</Muted>
                      ) : (
                        <span>
                          <Mono>{pct(r.marginPct)}</Mono>
                          {r.costedRevenueCents < r.revenueCents && (
                            <span className="ml-1 text-[10px] text-zinc-400">
                              ({Math.round((r.costedRevenueCents / r.revenueCents) * 100)}%
                              costed)
                            </span>
                          )}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
              {marginBlended.orders > 0 && (
                <TableRow className="border-t-2 border-zinc-200">
                  <TableCell className="text-zinc-500">
                    <Muted>Blended (all channels)</Muted>
                  </TableCell>
                  <TableCell className="text-right">
                    <Muted>{marginBlended.orders}</Muted>
                  </TableCell>
                  <TableCell className="text-right">
                    <Muted>{fmt(marginBlended.revenue)}</Muted>
                  </TableCell>
                  <TableCell className="text-right">
                    <Muted>{fmt(marginBlended.cogs)}</Muted>
                  </TableCell>
                  <TableCell className="text-right">
                    <Muted>{fmt(marginBlended.shipping)}</Muted>
                  </TableCell>
                  <TableCell className="text-right">
                    <Muted>{fmt(marginBlended.refunds)}</Muted>
                  </TableCell>
                  <TableCell className="text-right">
                    <Muted>
                      {cogsCoverage > 0 ? fmt(marginBlended.contribution) : "—"}
                    </Muted>
                  </TableCell>
                  <TableCell className="text-right">
                    <Muted>
                      {cogsCoverage >= MARGIN_COVERAGE_THRESHOLD && marginBlended.revenue > 0
                        ? pct((marginBlended.contribution / marginBlended.revenue) * 100)
                        : "—"}
                    </Muted>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DataTable>
      </section>
    </div>
  );
}
