"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { GRID_PROPS, X_AXIS_STYLE, Y_AXIS_STYLE, COLORS, formatCurrency } from "@/lib/chart-utils";
import { ChartLegend, useLegendToggle } from "./chart-legend";

interface DataPoint {
  bucket: string;
  label: string;
  metaSpend: number;
  googleSpend: number;
  revenue: number;
  roas: number;
}

const SERIES = [
  { key: "metaSpend", label: "Meta Spend", color: COLORS.metaSpend },
  { key: "googleSpend", label: "Google Spend", color: COLORS.googleSpend },
  { key: "revenue", label: "Revenue", color: COLORS.revenue },
  { key: "roas", label: "ROAS", color: COLORS.roas, dashed: true },
];

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-zinc-900">{label}</p>
      <p className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS.metaSpend }} />
        Meta Spend: {formatCurrency(data?.metaSpend ?? 0)}
      </p>
      <p className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS.googleSpend }} />
        Google Spend: {formatCurrency(data?.googleSpend ?? 0)}
      </p>
      <p className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS.revenue }} />
        Revenue: {formatCurrency(data?.revenue ?? 0)}
      </p>
      <p className="mt-1 border-t border-zinc-100 pt-1 font-medium">
        ROAS: {data?.roas?.toFixed(1) ?? "—"}x
      </p>
    </div>
  );
}

export function AdSpendRevenueChart({ data }: { data: DataPoint[] }) {
  const { isHidden, toggle, isolate } = useLegendToggle(SERIES.map((s) => s.key));

  if (data.length === 0) return <p className="py-8 text-center text-sm text-zinc-400">No ad spend data for this period.</p>;

  return (
    <div>
      <ChartLegend items={SERIES} isHidden={isHidden} onToggle={toggle} onIsolate={isolate} />
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 4, right: 40, left: -10, bottom: 0 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" tick={X_AXIS_STYLE} tickLine={false} axisLine={false} />
          <YAxis yAxisId="left" tick={Y_AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 100).toLocaleString()}`} />
          <YAxis yAxisId="right" orientation="right" tick={Y_AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}x`} domain={[0, "auto"]} />
          <Tooltip content={<ChartTooltip />} />
          <ReferenceLine yAxisId="right" y={1} stroke="#d4d4d8" strokeDasharray="3 3" label={{ value: "1x", position: "right", fontSize: 10, fill: "#a1a1aa" }} />
          {!isHidden("metaSpend") && (
            <Bar yAxisId="left" dataKey="metaSpend" name="Meta Spend" fill={COLORS.metaSpend} radius={[2, 2, 0, 0]} stackId="spend" barSize={20} />
          )}
          {!isHidden("googleSpend") && (
            <Bar yAxisId="left" dataKey="googleSpend" name="Google Spend" fill={COLORS.googleSpend} radius={[2, 2, 0, 0]} stackId="spend" barSize={20} />
          )}
          {!isHidden("revenue") && (
            <Line yAxisId="left" type="monotone" dataKey="revenue" name="Revenue" stroke={COLORS.revenue} strokeWidth={2} dot={false} />
          )}
          {!isHidden("roas") && (
            <Line yAxisId="right" type="monotone" dataKey="roas" name="ROAS" stroke={COLORS.roas} strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
