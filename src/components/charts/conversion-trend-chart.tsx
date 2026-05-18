"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { GRID_PROPS, X_AXIS_STYLE, Y_AXIS_STYLE, COLORS, formatNumber } from "@/lib/chart-utils";
import { ChartLegend, useLegendToggle } from "./chart-legend";

interface DataPoint {
  bucket: string;
  label: string;
  sessions: number;
  orders: number;
  conversionRate: number;
}

const SERIES = [
  { key: "sessions", label: "Sessions", color: COLORS.sessions },
  { key: "orders", label: "Orders", color: COLORS.web },
  { key: "conversionRate", label: "Conversion %", color: COLORS.roas, dashed: true },
];

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-zinc-900">{label}</p>
      <p className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS.sessions }} />
        Sessions: {formatNumber(data?.sessions ?? 0)}
      </p>
      <p className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS.web }} />
        Orders: {formatNumber(data?.orders ?? 0)}
      </p>
      <p className="mt-1 border-t border-zinc-100 pt-1 font-medium">
        Conversion: {data?.conversionRate?.toFixed(2) ?? "—"}%
      </p>
    </div>
  );
}

export function ConversionTrendChart({ data }: { data: DataPoint[] }) {
  const { isHidden, toggle, isolate } = useLegendToggle(SERIES.map((s) => s.key));

  if (data.length === 0) return <p className="py-8 text-center text-sm text-zinc-400">No conversion data for this period.</p>;

  return (
    <div>
      <ChartLegend items={SERIES} isHidden={isHidden} onToggle={toggle} onIsolate={isolate} />
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 4, right: 40, left: -10, bottom: 0 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" tick={X_AXIS_STYLE} tickLine={false} axisLine={false} />
          <YAxis yAxisId="left" tick={Y_AXIS_STYLE} tickLine={false} axisLine={false} />
          <YAxis yAxisId="right" orientation="right" tick={Y_AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} domain={[0, "auto"]} />
          <Tooltip content={<ChartTooltip />} />
          {!isHidden("sessions") && (
            <Bar yAxisId="left" dataKey="sessions" name="Sessions" fill={COLORS.sessions} radius={[2, 2, 0, 0]} barSize={16} fillOpacity={0.3} />
          )}
          {!isHidden("orders") && (
            <Bar yAxisId="left" dataKey="orders" name="Orders" fill={COLORS.web} radius={[2, 2, 0, 0]} barSize={16} />
          )}
          {!isHidden("conversionRate") && (
            <Line yAxisId="right" type="monotone" dataKey="conversionRate" name="Conversion %" stroke={COLORS.roas} strokeWidth={2} strokeDasharray="4 2" dot={{ r: 2, fill: COLORS.roas }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
