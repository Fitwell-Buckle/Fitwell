"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  GRID_PROPS,
  X_AXIS_STYLE,
  Y_AXIS_STYLE,
  formatCurrency,
  formatNumber,
  computeTrend,
} from "@/lib/chart-utils";

export type SegmentFormat = "currency" | "number" | "decimal";

export interface SegmentPoint {
  label: string;
  d2c: number;
  tradeshow: number;
  b2b: number;
}

const SERIES = [
  { key: "d2c", label: "D2C (Online)", color: "#18181b" },
  { key: "tradeshow", label: "Trade Show", color: "#a1a1aa" },
  { key: "b2b", label: "B2B (Wholesale)", color: "#3b82f6" },
] as const;

function formatterFor(format: SegmentFormat): (n: number) => string {
  if (format === "currency") return formatCurrency;
  if (format === "decimal") return (n: number) => n.toFixed(2);
  return formatNumber;
}

function axisTickFor(format: SegmentFormat): (v: number) => string {
  if (format === "currency") return (v) => `$${(v / 100).toLocaleString()}`;
  if (format === "decimal") return (v) => v.toFixed(1);
  return (v) => v.toLocaleString();
}

function SegTooltip({
  active,
  payload,
  label,
  fmt,
}: {
  active?: boolean;
  payload?: { dataKey: string; name: string; value: number; color: string }[];
  label?: string;
  fmt: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => !p.dataKey.endsWith("Trend"));
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-zinc-900">{label}</p>
      {rows.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-zinc-600">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: p.color }}
          />
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

/** Full-width multi-line chart with one line per sales segment. Pass `show` to
 * render only a subset of segments (e.g. when the dashboard is scoped to one). */
export function SegmentLineChart({
  data,
  format,
  show,
}: {
  data: SegmentPoint[];
  format: SegmentFormat;
  show?: readonly ("d2c" | "tradeshow" | "b2b")[];
}) {
  const fmt = formatterFor(format);
  const visible = SERIES.filter((s) => !show || show.includes(s.key));
  // Overlay a straight best-fit line per visible segment.
  const enriched: Record<string, number | string>[] = data.map((d) => ({
    ...d,
  }));
  for (const s of visible) {
    const t = computeTrend(data.map((d) => d[s.key]));
    enriched.forEach((row, i) => {
      row[`${s.key}Trend`] = t[i];
    });
  }
  if (!data.some((d) => d.d2c || d.tradeshow || d.b2b)) {
    return (
      <p className="py-12 text-center text-sm text-zinc-400">
        No data for this period.
      </p>
    );
  }
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {visible.map((s) => (
          <span
            key={s.key}
            className="flex items-center gap-1.5 text-xs text-zinc-500"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={enriched} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            dataKey="label"
            tick={X_AXIS_STYLE}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={Y_AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            tickFormatter={axisTickFor(format)}
          />
          <Tooltip content={<SegTooltip fmt={fmt} />} />
          {/* Trend lines first, so the actual lines render on top. */}
          {visible.map((s) => (
            <Line
              key={`${s.key}-trend`}
              type="linear"
              dataKey={`${s.key}Trend`}
              stroke={s.color}
              strokeOpacity={0.3}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
              legendType="none"
            />
          ))}
          {visible.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
