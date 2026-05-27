import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { parseDateRange } from "@/lib/date-range";
import {
  getAcquisitionFunnel,
  getRetentionLoop,
  getChannelBreakdown,
  formatCents,
  formatCount,
  confidenceLabel,
  type Confidence,
  type FunnelStageRow,
  type RetentionStageRow,
  type ChannelRow,
} from "@/lib/funnel/strategy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Mono } from "@/components/ui/data-table";

export const metadata: Metadata = {
  title: "Strategic Funnel | Fitwell Admin",
};

const STAGE_LABEL: Record<string, string> = {
  unaware: "Unaware",
  problem_aware: "Problem Aware",
  solution_aware: "Solution Aware",
  brand_aware: "Brand Aware",
  considering: "Considering",
  converting: "Converting",
};

const STAGE_DESCRIPTION: Record<string, string> = {
  unaware: "Doesn't know they have a problem. Top-of-funnel ad reach.",
  problem_aware:
    "Recognizes the comfort issue. Clicked or engaged with awareness content.",
  solution_aware:
    "Knows micro-adjust buckles exist. Active search or research behavior.",
  brand_aware: "Knows Fitwell exists. Direct visits or brand-search arrivals.",
  considering:
    "Actively evaluating purchase. Add-to-cart and checkout intent.",
  converting: "Completing the transaction. Order placed.",
};

const CONFIDENCE_COLORS: Record<Confidence, string> = {
  strong: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  weak: "bg-orange-50 text-orange-700 border-orange-200",
  missing: "bg-zinc-100 text-zinc-500 border-zinc-200",
};

function ConfidenceBadge({ c }: { c: Confidence }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${CONFIDENCE_COLORS[c]}`}
    >
      {confidenceLabel(c)}
    </span>
  );
}

function AcquisitionStageRow({ row }: { row: FunnelStageRow }) {
  return (
    <div className="border-b border-zinc-100 py-4 last:border-b-0">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h3 className="text-sm font-medium text-zinc-900">
            {STAGE_LABEL[row.stage] ?? row.stage}
          </h3>
          <ConfidenceBadge c={row.confidence} />
        </div>
        <span className="font-mono text-2xl font-medium text-zinc-900">
          {row.confidence === "missing" ? "—" : formatCount(row.value)}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        {STAGE_DESCRIPTION[row.stage] ?? ""}
      </p>
      <p className="mt-1.5 text-[11px] text-zinc-400">
        <span className="font-medium text-zinc-500">Source:</span>{" "}
        <Mono>{row.source}</Mono>
      </p>
      {row.note && (
        <p className="mt-1 text-[11px] italic text-zinc-400">{row.note}</p>
      )}
    </div>
  );
}

function RetentionStageBar({ row }: { row: RetentionStageRow }) {
  const widthPct = Math.max(2, Math.min(100, row.pctOfBase));
  return (
    <div className="py-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-medium text-zinc-900">
            {row.label}
          </span>
          <span className="text-xs text-zinc-400">{row.rule}</span>
          <ConfidenceBadge c={row.confidence} />
        </div>
        <span className="font-mono text-sm font-medium text-zinc-900">
          {formatCount(row.customers)}{" "}
          <span className="text-xs text-zinc-400">
            ({row.pctOfBase.toFixed(1)}%)
          </span>
        </span>
      </div>
      <div className="h-5 rounded bg-zinc-100">
        <div
          className="h-5 rounded bg-zinc-900 transition-all"
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-zinc-400">
        <span>
          <Mono>Source: {row.source}</Mono>
        </span>
        {row.avgSpendCents > 0 && (
          <span>
            Avg spend <Mono>{formatCents(row.avgSpendCents)}</Mono>
            {" · "}Total <Mono>{formatCents(row.totalSpendCents)}</Mono>
          </span>
        )}
      </div>
      {row.note && (
        <p className="mt-1 text-[11px] italic text-zinc-400">{row.note}</p>
      )}
    </div>
  );
}

function ChannelTable({ rows }: { rows: ChannelRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-zinc-400">
        No channel data in window.
      </p>
    );
  }
  const totalCustomers = rows.reduce((s, r) => s + r.customers, 0);
  const totalSpend = rows.reduce((s, r) => s + r.totalSpendCents, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-zinc-200 text-xs uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="py-2 pr-4 text-left font-medium">Channel</th>
            <th className="py-2 pr-4 text-right font-medium">Customers</th>
            <th className="py-2 pr-4 text-right font-medium">% of base</th>
            <th className="py-2 pr-4 text-right font-medium">Orders</th>
            <th className="py-2 pr-4 text-right font-medium">Total revenue</th>
            <th className="py-2 text-right font-medium">Avg LTV / cust</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const pct =
              totalCustomers > 0 ? (100 * row.customers) / totalCustomers : 0;
            return (
              <tr
                key={row.channel}
                className="border-b border-zinc-100 last:border-b-0"
              >
                <td className="py-2.5 pr-4 text-zinc-900">{row.label}</td>
                <td className="py-2.5 pr-4 text-right font-mono text-zinc-900">
                  {formatCount(row.customers)}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono text-zinc-500">
                  {pct.toFixed(1)}%
                </td>
                <td className="py-2.5 pr-4 text-right font-mono text-zinc-700">
                  {formatCount(row.orders)}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono text-zinc-700">
                  {formatCents(row.totalSpendCents)}
                </td>
                <td className="py-2.5 text-right font-mono text-zinc-900">
                  {formatCents(row.avgLtvCents)}
                </td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-zinc-300">
            <td className="py-2.5 pr-4 text-sm font-medium text-zinc-900">
              Total
            </td>
            <td className="py-2.5 pr-4 text-right font-mono font-medium text-zinc-900">
              {formatCount(totalCustomers)}
            </td>
            <td className="py-2.5 pr-4 text-right font-mono text-zinc-400">
              100.0%
            </td>
            <td className="py-2.5 pr-4" />
            <td className="py-2.5 pr-4 text-right font-mono font-medium text-zinc-900">
              {formatCents(totalSpend)}
            </td>
            <td className="py-2.5 text-right font-mono font-medium text-zinc-900">
              {totalCustomers > 0
                ? formatCents(Math.round(totalSpend / totalCustomers))
                : "—"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default async function FunnelStrategyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const { from, to } = parseDateRange(params);

  const [acq, retention, channels] = await Promise.all([
    getAcquisitionFunnel(from, to),
    // Retention loop + channel breakdown are full-customer-base views
    // (LTV makes no sense windowed); they ignore the date range.
    getRetentionLoop(),
    getChannelBreakdown(),
  ]);

  return (
    <div className="space-y-10 pb-12">
      <div>
        <PageHeader title="Strategic Funnel" />
        <p className="mt-1.5 max-w-3xl text-sm text-zinc-500">
          Diagnostic view aligned with{" "}
          <Mono>specs/strategy/funnel.md</Mono>,{" "}
          <Mono>specs/strategy/retention-loop.md</Mono>, and{" "}
          <Mono>specs/strategy/personas.md</Mono>. The acquisition funnel
          windows to the selected date range; the retention loop and
          channel breakdown are full-customer-base views (LTV requires
          full history). Stages marked{" "}
          <span className="rounded-full border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            needs instrumentation
          </span>{" "}
          require new data sources before they're measurable.
        </p>
      </div>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Acquisition funnel — six stages</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-zinc-500">
              Window: <Mono>{from.toISOString().slice(0, 10)}</Mono> →{" "}
              <Mono>{to.toISOString().slice(0, 10)}</Mono>
            </p>
            <div>
              {acq.stages.map((row) => (
                <AcquisitionStageRow key={row.stage} row={row} />
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Retention loop — first buyer → advocate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-zinc-500">
              All paying customers in the database ({" "}
              <Mono>{formatCount(retention.totalCustomers)}</Mono> total).
              Each customer is in exactly one stage based on lifetime
              orders + units.
            </p>
            <div>
              {retention.stages.map((row) => (
                <RetentionStageBar key={row.stage} row={row} />
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Channel entry breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-xs text-zinc-500">
              First-touch UTM mapped to the channel taxonomy in{" "}
              <Mono>funnel.md</Mono>. Welcome-flow vs. retention split for
              Klaviyo is decided by campaign-name heuristic; see{" "}
              <Mono>src/lib/funnel/classify.ts</Mono>.
            </p>
            <ChannelTable rows={channels} />
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>What's missing — instrumentation backlog</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-zinc-700">
              <li>
                <strong>PostHog client-side events</strong> — wire the
                storefront pixel so <Mono>cart_item_added</Mono> and{" "}
                <Mono>checkout_started</Mono> populate the{" "}
                <strong>considering</strong> stage. Plan:{" "}
                <Mono>specs/work-plans/todo/posthog-integration.md</Mono>.
              </li>
              <li>
                <strong>GSC auth</strong> — unblock Google service-account
                access so branded vs. category vs. problem search clicks
                separate cleanly in <strong>solution_aware</strong> and{" "}
                <strong>brand_aware</strong>.
              </li>
              <li>
                <strong>Klaviyo API</strong> — sync list size, flow
                attribution, and per-email UTMs so the welcome-flow vs.
                post-purchase split becomes a live query, not a heuristic
                on campaign name.
              </li>
              <li>
                <strong>Judge.me API</strong> — live <strong>advocate</strong>{" "}
                count instead of the 2026-05-26 snapshot.
              </li>
              <li>
                <strong>Campaign-name parsing for cold vs. retargeting</strong>{" "}
                — split <Mono>metaAdsDaily</Mono> into{" "}
                <strong>unaware</strong> (cold impressions) vs. retargeting
                impressions (which belong in <strong>considering</strong>
                ).
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
