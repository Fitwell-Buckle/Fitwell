"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { GRID_PROPS, X_AXIS_STYLE, Y_AXIS_STYLE, COLORS, formatCurrency } from "@/lib/chart-utils";

interface DataPoint {
  bucket: string;
  label: string;
  web: number;
  wholesale: number;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-zinc-900">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
}

export function RevenueTrendChart({ data }: { data: DataPoint[] }) {
  if (data.length === 0) return <p className="py-8 text-center text-sm text-zinc-400">No revenue data for this period.</p>;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" tick={X_AXIS_STYLE} tickLine={false} axisLine={false} />
        <YAxis tick={Y_AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 100).toLocaleString()}`} />
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey="web" name="DTC (Web)" stackId="1" fill={COLORS.web} stroke={COLORS.web} fillOpacity={0.15} />
        <Area type="monotone" dataKey="wholesale" name="Wholesale" stackId="1" fill={COLORS.wholesale} stroke={COLORS.wholesale} fillOpacity={0.1} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
