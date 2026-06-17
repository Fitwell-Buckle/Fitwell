import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { parseDateRange } from "@/lib/date-range";
import { getCogs } from "@/lib/cogs/cogs";
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
        quantity-weighted average cost from received (or prepaid) purchase
        orders. Sample orders are excluded. Margin&nbsp;% is computed on costed
        revenue only.
      </p>

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
    </div>
  );
}
