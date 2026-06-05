import type { Metadata } from "next";
import Link from "next/link";
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
  type OrderPosition,
  type RetentionStage,
} from "@/lib/funnel/strategy";
import { RETENTION_STAGE_META } from "@/lib/funnel/classify";
import { getKlaviyoOverview, type KlaviyoOverview } from "@/lib/klaviyo/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Mono } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";

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
          className="h-5 rounded bg-brand transition-all"
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

// Retention-stage colors used by both filter pills and segment-mix bars.
// Order matches the classifier hierarchy so the stacked bar reads
// "newest-buyer left → most-engaged right".
const SEGMENT_ORDER: RetentionStage[] = [
  "first_buyer",
  "second_buyer",
  "multi_unit",
  "outfitter",
  "advocate",
];

const SEGMENT_COLORS: Record<RetentionStage, { bar: string; pill: string }> = {
  first_buyer: { bar: "bg-zinc-300", pill: "border-zinc-300 text-zinc-700" },
  second_buyer: { bar: "bg-sky-400", pill: "border-sky-400 text-sky-700" },
  multi_unit: { bar: "bg-amber-400", pill: "border-amber-400 text-amber-700" },
  outfitter: { bar: "bg-emerald-500", pill: "border-emerald-500 text-emerald-700" },
  advocate: { bar: "bg-violet-500", pill: "border-violet-500 text-violet-700" },
};

function SegmentMixBar({ row }: { row: ChannelRow }) {
  if (row.customers === 0) return null;
  return (
    <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
      {SEGMENT_ORDER.map((stage) => {
        const n = row.segmentMix[stage];
        if (n === 0) return null;
        const pct = (n / row.customers) * 100;
        return (
          <div
            key={stage}
            className={SEGMENT_COLORS[stage].bar}
            style={{ width: `${pct}%` }}
            title={`${RETENTION_STAGE_META[stage].label}: ${n} (${pct.toFixed(1)}%)`}
          />
        );
      })}
    </div>
  );
}

function SegmentFilterPills({
  active,
  buildHref,
}: {
  active: RetentionStage | null;
  buildHref: (segment: RetentionStage | null) => string;
}) {
  const pillBase =
    "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors";
  const allPill = active === null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] uppercase tracking-wider text-zinc-500">
        Filter channel breakdown by segment:
      </span>
      <Link
        href={buildHref(null)}
        className={cn(
          pillBase,
          allPill
            ? "border-brand bg-brand text-white"
            : "border-zinc-200 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900",
        )}
      >
        All
      </Link>
      {SEGMENT_ORDER.map((stage) => {
        const isActive = active === stage;
        const c = SEGMENT_COLORS[stage];
        return (
          <Link
            key={stage}
            href={buildHref(stage)}
            className={cn(
              pillBase,
              isActive
                ? `${c.pill} bg-white shadow-[inset_0_0_0_1px_currentColor]`
                : `border-zinc-200 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900`,
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", c.bar)} />
            {RETENTION_STAGE_META[stage].label}
          </Link>
        );
      })}
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
                <td className="py-2.5 pr-4 text-zinc-900">
                  <div>{row.label}</div>
                  <SegmentMixBar row={row} />
                </td>
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

function FlowBucketBar({
  label,
  revenueCents,
  orders,
  totalCents,
  color,
}: {
  label: string;
  revenueCents: number;
  orders: number;
  totalCents: number;
  color: string;
}) {
  const pct = totalCents > 0 ? (revenueCents / totalCents) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-zinc-700">{label}</span>
        <span className="font-mono text-zinc-900">
          {formatCents(revenueCents)}{" "}
          <span className="text-zinc-400">· {orders} orders</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="text-[10px] text-zinc-400">
        {pct.toFixed(1)}% of attributed flow revenue
      </div>
    </div>
  );
}

function KlaviyoSection({ k }: { k: KlaviyoOverview }) {
  if (!k.hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email program (Klaviyo API)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500">
            No data yet. The <Mono>/api/cron/extract-klaviyo</Mono> cron
            runs daily at 07:30 UTC. Trigger it manually with{" "}
            <Mono>curl https://admin.fitwellbuckle.co/api/cron/extract-klaviyo</Mono>{" "}
            (signed in as admin) to populate.
          </p>
        </CardContent>
      </Card>
    );
  }

  const netLabel =
    k.growth30dNet >= 0 ? `+${formatCount(k.growth30dNet)}` : `${formatCount(k.growth30dNet)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email program (Klaviyo API)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-xs text-zinc-500">
          Live email-side measurement from the Klaviyo API. Replaces the
          UTM-heuristic acquisition-vs-retention split in{" "}
          <Mono>scripts/klaviyo-acquisition-vs-retention.ts</Mono>.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              Subscribers
            </div>
            <div className="mt-1 font-mono text-2xl text-zinc-900">
              {k.subscribersLatest !== null
                ? formatCount(k.subscribersLatest)
                : "—"}
            </div>
            <div className="text-[11px] text-zinc-400">latest snapshot</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              30-day net change
            </div>
            <div
              className={`mt-1 font-mono text-2xl ${
                k.growth30dNet >= 0 ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {netLabel}
            </div>
            <div className="text-[11px] text-zinc-400">
              new − unsub (Klaviyo events)
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              Flow revenue (90d)
            </div>
            <div className="mt-1 font-mono text-2xl text-zinc-900">
              {formatCents(k.flowSplit.totalRevenueCents)}
            </div>
            <div className="text-[11px] text-zinc-400">
              attributed across {k.flowSplit.flows.length} flows
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium text-zinc-700">
            Welcome vs. post-purchase
          </div>
          <div className="space-y-3">
            <FlowBucketBar
              label="Welcome flow"
              revenueCents={k.flowSplit.welcomeRevenueCents}
              orders={k.flowSplit.welcomeOrders}
              totalCents={k.flowSplit.totalRevenueCents}
              color="bg-emerald-500"
            />
            <FlowBucketBar
              label="Post-purchase"
              revenueCents={k.flowSplit.postPurchaseRevenueCents}
              orders={k.flowSplit.postPurchaseOrders}
              totalCents={k.flowSplit.totalRevenueCents}
              color="bg-blue-500"
            />
            <FlowBucketBar
              label="Other flows"
              revenueCents={k.flowSplit.otherRevenueCents}
              orders={k.flowSplit.otherOrders}
              totalCents={k.flowSplit.totalRevenueCents}
              color="bg-zinc-400"
            />
          </div>
        </div>

        {k.topCampaigns.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-medium text-zinc-700">
              Top 5 campaigns by attributed revenue
            </div>
            <div className="overflow-hidden rounded-md border border-zinc-200">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 text-zinc-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Campaign</th>
                    <th className="px-3 py-2 text-right font-medium">Sends</th>
                    <th className="px-3 py-2 text-right font-medium">Opens</th>
                    <th className="px-3 py-2 text-right font-medium">Clicks</th>
                    <th className="px-3 py-2 text-right font-medium">Orders</th>
                    <th className="px-3 py-2 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {k.topCampaigns.map((c) => (
                    <tr key={c.campaignId} className="border-t border-zinc-100">
                      <td className="px-3 py-2 text-zinc-900">
                        {c.campaignName ?? c.campaignId}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatCount(c.sends)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatCount(c.opens)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatCount(c.clicks)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatCount(c.conversions)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatCents(c.revenueCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Whitelist of valid segment values for the ?segment= URL param —
// avoids passing unsanitized input into the data layer.
const VALID_SEGMENTS = new Set<RetentionStage>([
  "first_buyer",
  "second_buyer",
  "multi_unit",
  "outfitter",
  "advocate",
]);

function parseSegment(
  params: Record<string, string | string[] | undefined>,
): RetentionStage | null {
  const raw = typeof params.segment === "string" ? params.segment : null;
  if (raw && VALID_SEGMENTS.has(raw as RetentionStage)) {
    return raw as RetentionStage;
  }
  return null;
}

function buildSegmentHref(
  current: Record<string, string | string[] | undefined>,
  segment: RetentionStage | null,
): string {
  const usp = new URLSearchParams();
  // Preserve other params (date range, etc.) but drop the old segment.
  for (const [k, v] of Object.entries(current)) {
    if (k === "segment") continue;
    if (typeof v === "string") usp.set(k, v);
  }
  if (segment) usp.set("segment", segment);
  const qs = usp.toString();
  return qs ? `?${qs}` : "?";
}

// Whitelist of valid position values for the ?position= URL param.
const VALID_POSITIONS = new Set<OrderPosition>([
  "acquisition",
  "retention",
]);

function parsePosition(
  params: Record<string, string | string[] | undefined>,
): OrderPosition | null {
  const raw = typeof params.position === "string" ? params.position : null;
  if (raw && VALID_POSITIONS.has(raw as OrderPosition)) {
    return raw as OrderPosition;
  }
  return null;
}

function buildPositionHref(
  current: Record<string, string | string[] | undefined>,
  position: OrderPosition | null,
): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (k === "position") continue;
    if (typeof v === "string") usp.set(k, v);
  }
  if (position) usp.set("position", position);
  const qs = usp.toString();
  return qs ? `?${qs}` : "?";
}

function PositionFilterPills({
  active,
  buildHref,
}: {
  active: OrderPosition | null;
  buildHref: (position: OrderPosition | null) => string;
}) {
  const pillBase =
    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors";
  const items: {
    label: string;
    value: OrderPosition | null;
    description: string;
  }[] = [
    { label: "All orders", value: null, description: "lifetime view" },
    {
      label: "First order",
      value: "acquisition",
      description: "acquisition position (sequence 1)",
    },
    {
      label: "Repeat orders",
      value: "retention",
      description: "retention position (sequence > 1)",
    },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] uppercase tracking-wider text-zinc-500">
        Split by order position:
      </span>
      {items.map((it) => {
        const isActive = active === it.value;
        return (
          <Link
            key={it.label}
            href={buildHref(it.value)}
            title={it.description}
            className={cn(
              pillBase,
              isActive
                ? "border-brand bg-brand text-white"
                : "border-zinc-200 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900",
            )}
          >
            {it.label}
          </Link>
        );
      })}
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
  const segmentFilter = parseSegment(params);
  const positionFilter = parsePosition(params);

  const [acq, retention, channels, klaviyo] = await Promise.all([
    getAcquisitionFunnel(from, to),
    // Retention loop + channel breakdown are full-customer-base views
    // (LTV makes no sense windowed); they ignore the date range.
    getRetentionLoop(),
    getChannelBreakdown(
      segmentFilter ?? undefined,
      positionFilter ?? undefined,
    ),
    getKlaviyoOverview(),
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
            <p className="mb-3 text-xs text-zinc-500">
              First-touch UTM mapped to the channel taxonomy in{" "}
              <Mono>funnel.md</Mono>. Each row shows a stacked segment-mix
              bar under the channel name — colors match the filter pills.
              Welcome-flow vs. retention split for Klaviyo is decided by
              campaign-name heuristic; see{" "}
              <Mono>src/lib/funnel/classify.ts</Mono>.
            </p>
            <div className="mb-4 space-y-3">
              <SegmentFilterPills
                active={segmentFilter}
                buildHref={(seg) => buildSegmentHref(params, seg)}
              />
              <PositionFilterPills
                active={positionFilter}
                buildHref={(pos) => buildPositionHref(params, pos)}
              />
              {(segmentFilter || positionFilter) && (
                <p className="mt-2 text-[11px] italic text-zinc-500">
                  {segmentFilter && (
                    <>
                      Segment-filtered to{" "}
                      <Mono>
                        {RETENTION_STAGE_META[segmentFilter].label}
                      </Mono>{" "}
                      customers only.{" "}
                    </>
                  )}
                  {positionFilter === "acquisition" && (
                    <>
                      Showing each customer's <strong>first D2C order only</strong>{" "}
                      (sequence = 1 by <Mono>processed_at</Mono>) — acquisition
                      revenue per channel. Segment mix still reflects lifetime
                      customer classification.
                    </>
                  )}
                  {positionFilter === "retention" && (
                    <>
                      Showing each customer's <strong>repeat orders only</strong>{" "}
                      (sequence &gt; 1 by <Mono>processed_at</Mono>) — retention
                      revenue per channel attributed back to first-touch UTM.
                      Customers with no repeat orders are excluded.
                    </>
                  )}
                </p>
              )}
            </div>
            <ChannelTable rows={channels} />
          </CardContent>
        </Card>
      </section>

      <section>
        <KlaviyoSection k={klaviyo} />
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
                <strong>Klaviyo per-order attribution</strong> — Phase 0
                shipped aggregate flow totals (above). Per-order
                grain (joining the Placed Order event stream to the{" "}
                <Mono>order</Mono> table) is a Phase 0.5 follow-up so the
                channel breakdown can show per-flow rows instead of a
                single UTM-derived Klaviyo row.
              </li>
              <li>
                <strong>Judge.me API</strong> — live <strong>advocate</strong>{" "}
                count instead of the 2026-05-26 snapshot.
              </li>
              <li>
                <strong>Upper-funnel persona × stage cross-cut</strong> —
                segment filter pills above the channel breakdown work for
                customers we've classified post-purchase. Cutting{" "}
                <strong>unaware</strong> /{" "}
                <strong>problem_aware</strong> by persona requires PostHog
                persona inference from behavior patterns; deferred until
                PostHog Phase 1+2 lands.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
