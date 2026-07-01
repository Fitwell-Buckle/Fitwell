import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getCreatorCommissions } from "@/lib/creators/commission-queries";
import { PAYOUT_FLOOR_CENTS } from "@/lib/creators/commission";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, Mono, Muted } from "@/components/ui/data-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClickableRow } from "@/components/ui/clickable-row";

export const metadata: Metadata = {
  title: "Creator payouts | Fitwell Admin",
};

const money = (cents: number) => `$${(cents / 100).toLocaleString()}`;

const TAX_LABELS: Record<string, string> = {
  none: "—",
  requested: "W-9 requested",
  received: "W-9 on file",
};

export default async function CreatorPayoutsPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const all = await getCreatorCommissions();
  // Only creators with commission activity — earned or already paid.
  const active = all.filter((c) => c.earnedCents > 0 || c.paidCents > 0);
  const payable = active.filter((c) => c.payable);
  const totalOwed = active.reduce((sum, c) => sum + c.owedCents, 0);
  const payableOwed = payable.reduce((sum, c) => sum + c.owedCents, 0);

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title="Creator payouts" />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/creators">← Creators</Link>
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-6 text-sm">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            Ready to pay (≥ {money(PAYOUT_FLOOR_CENTS)})
          </div>
          <div className="font-mono text-lg">
            {money(payableOwed)}{" "}
            <span className="text-sm text-zinc-400">· {payable.length} creators</span>
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            Total owed (all)
          </div>
          <div className="font-mono text-lg text-zinc-500">{money(totalOwed)}</div>
        </div>
      </div>

      <Muted>
        Commission is computed live from each creator&apos;s discount-code
        redemptions × their rate, minus recorded payouts. Payout is manual — cut it,
        then log it on the creator&apos;s page so &ldquo;owed&rdquo; clears.
      </Muted>

      <DataTable className="mt-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Creator</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Attributed</TableHead>
              <TableHead className="text-right">Earned</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Owed</TableHead>
              <TableHead>Payout to</TableHead>
              <TableHead>Tax</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {active.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center">
                  <Muted>
                    No commission earned yet. It appears here once a creator&apos;s
                    code drives a sale.
                  </Muted>
                </TableCell>
              </TableRow>
            )}
            {active.map((c) => (
              <ClickableRow key={c.creatorId} href={`/creators/${c.creatorId}`}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>
                  {c.offerTier ? (
                    <Badge className="capitalize">{c.offerTier}</Badge>
                  ) : (
                    <Muted>—</Muted>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Mono>{c.ratePct ? `${c.ratePct}%` : "—"}</Mono>
                </TableCell>
                <TableCell className="text-right">
                  <Mono>{money(c.attributedNetRevenueCents)}</Mono>
                </TableCell>
                <TableCell className="text-right">
                  <Mono>{money(c.earnedCents)}</Mono>
                </TableCell>
                <TableCell className="text-right">
                  <Mono>{money(c.paidCents)}</Mono>
                </TableCell>
                <TableCell className="text-right">
                  <span
                    className={`flex items-center justify-end gap-1.5 font-mono ${
                      c.payable ? "font-semibold text-emerald-600" : ""
                    }`}
                  >
                    {money(c.owedCents)}
                    {c.payable && <Badge>ready</Badge>}
                  </span>
                </TableCell>
                <TableCell>
                  {c.payoutEmail ? (
                    <span className="font-mono text-xs">{c.payoutEmail}</span>
                  ) : (
                    <span
                      title="No payout email set — add one on the creator's page before paying."
                      className="text-amber-500"
                    >
                      ⚠ missing
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-xs text-zinc-400">
                    {TAX_LABELS[c.taxFormStatus] ?? c.taxFormStatus}
                  </span>
                </TableCell>
              </ClickableRow>
            ))}
          </TableBody>
        </Table>
      </DataTable>
    </div>
  );
}
