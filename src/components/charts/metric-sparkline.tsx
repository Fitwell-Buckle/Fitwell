"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/chart-utils";

export interface MetricPoint {
  label: string;
  value: number;
  /** Optional companion percentage (e.g. returns as % of D2C) for that bucket. */
  pct?: number;
}

const PCT_COLOR = "#3b82f6";

function SparkTooltip({
  active,
  payload,
  label,
  fmt,
  pctLabel,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number; color: string }[];
  label?: string;
  fmt: (n: number) => string;
  pctLabel: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-md">
      <p className="mb-0.5 font-medium text-zinc-900">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-1.5 text-zinc-600">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: p.color }}
          />
          {p.dataKey === "pct"
            ? `${p.value.toFixed(1)}% of ${pctLabel}`
            : fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

/**
 * Compact line chart for a single metric over the selected date buckets — the
 * "graph view" of a dashboard tile. Y-axes are hidden for density; the start and
 * end dates are shown under the chart. When `showPct`, a second (blue) line
 * plots each point's `pct` on its own hidden scale alongside the value.
 */
export function MetricSparkline({
  data,
  format,
  color = "#18181b",
  showPct = false,
  pctLabel = "total",
}: {
  data: MetricPoint[];
  format: "currency" | "number";
  color?: string;
  showPct?: boolean;
  pctLabel?: string;
}) {
  const fmt = format === "currency" ? formatCurrency : formatNumber;
  const hasValue = data.some((d) => d.value !== 0);
  const hasPct = showPct && data.some((d) => (d.pct ?? 0) !== 0);
  if (!hasValue && !hasPct) {
    return (
      <p className="py-6 text-center text-xs text-zinc-400">
        No data for this period.
      </p>
    );
  }
  const startLabel = data[0]?.label ?? "";
  const endLabel = data[data.length - 1]?.label ?? "";
  return (
    <div>
      <ResponsiveContainer width="100%" height={72}>
        <LineChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
          {/* Hidden, but binds the tooltip header to the bucket label (e.g.
              "Apr 26") instead of falling back to the row index. */}
          <XAxis dataKey="label" hide />
          <YAxis yAxisId="value" hide domain={["dataMin", "dataMax"]} />
          {showPct && (
            <YAxis yAxisId="pct" hide domain={["dataMin", "dataMax"]} />
          )}
          <Tooltip
            content={<SparkTooltip fmt={fmt} pctLabel={pctLabel} />}
            cursor={{ stroke: "#e4e4e7" }}
          />
          <Line
            yAxisId="value"
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
          {showPct && (
            <Line
              yAxisId="pct"
              type="monotone"
              dataKey="pct"
              stroke={PCT_COLOR}
              strokeWidth={2}
              strokeDasharray="3 3"
              dot={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}
