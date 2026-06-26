import {
  type ReturnDrivers,
  type ReturnRow,
  riskTone,
  TONE_TEXT,
  TONE_BAR,
  formatPct,
} from "@/lib/dashboard/return-drivers-format";

/** One metric block: a labelled list of segments with a proportion bar each. */
function MetricBlock({
  title,
  rows,
  baseline,
}: {
  title: string;
  rows: ReturnRow[];
  baseline: number;
}) {
  const maxPct = Math.max(0.0001, ...rows.map((r) => r.pct));
  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h4>
      <div className="space-y-2.5">
        {rows.map((r) => {
          const tone = riskTone(r.pct, baseline, r.unitsSold);
          return (
            <div key={r.segment}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-zinc-700" title={r.segment}>
                  {r.segment}
                </span>
                <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                  <span className={`font-medium ${TONE_TEXT[tone]}`}>
                    {formatPct(r.pct)}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    {r.unitsReturned}/{r.unitsSold}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={`h-full rounded-full ${TONE_BAR[tone]}`}
                  style={{ width: `${(r.pct / maxPct) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Time-to-refund block: each band as a share of all units (bands sum to the
 *  overall rate). Rendered separately since the denominator differs. */
function LatencyBlock({
  rows,
  baseline,
}: {
  rows: ReturnDrivers["latency"];
  baseline: number;
}) {
  const maxPct = Math.max(0.0001, ...rows.map((r) => r.pctOfAll));
  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Time to Refund
      </h4>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.band}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate text-zinc-700">{r.band}</span>
              <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                <span className="font-medium text-zinc-700">
                  {formatPct(r.pctOfAll)}
                </span>
                <span className="text-[11px] text-zinc-400">
                  {r.unitsReturned} units
                </span>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-zinc-400"
                style={{ width: `${(r.pctOfAll / maxPct) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-snug text-zinc-400">
        Each band as a share of all units sold — bands sum to the{" "}
        {formatPct(baseline)} overall rate.
      </p>
    </div>
  );
}

/**
 * Return Drivers — small-multiples of the unit-level return rate across nine
 * dimensions. All-time, D2C only. Cells are tinted relative to the overall
 * baseline (red ≥1.5×, amber ≥1.15×, green ≤0.6×); thin samples stay neutral.
 */
export function ReturnDriversCard({ data }: { data: ReturnDrivers }) {
  const b = data.baseline.pct;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <MetricBlock title="Product Family" rows={data.family} baseline={b} />
      <MetricBlock title="Product Size" rows={data.size} baseline={b} />
      <MetricBlock title="Product Color" rows={data.color} baseline={b} />
      <MetricBlock title="Products in Order" rows={data.basket} baseline={b} />
      <LatencyBlock rows={data.latency} baseline={b} />
      <MetricBlock title="Signal / Came From" rows={data.source} baseline={b} />
      <MetricBlock title="Time of Day" rows={data.timeOfDay} baseline={b} />
      <MetricBlock title="Day of Week" rows={data.dayOfWeek} baseline={b} />
      <MetricBlock title="Order Country" rows={data.country} baseline={b} />
    </div>
  );
}
