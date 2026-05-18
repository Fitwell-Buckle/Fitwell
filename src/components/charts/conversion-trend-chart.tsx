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
import { GRID_PROPS, X_AXIS_STYLE, Y_AXIS_STYLE } from "@/lib/chart-utils";

interface DataPoint {
  bucket: string;
  label: string;
  sessions: number;
  orders: number;
  conversionRate: number;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-zinc-900">{label}</p>
      <p>Sessions: {data?.sessions?.toLocaleString()}</p>
      <p>Orders: {data?.orders?.toLocaleString()}</p>
      <p className="mt-1 border-t border-zinc-100 pt-1 font-medium">
        Conversion: {data?.conversionRate?.toFixed(2)}%
      </p>
    </div>
  );
}

export function ConversionTrendChart({ data }: { data: DataPoint[] }) {
  if (data.length === 0) return <p className="py-8 text-center text-sm text-zinc-400">No conversion data for this period.</p>;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" tick={X_AXIS_STYLE} tickLine={false} axisLine={false} />
        <YAxis tick={Y_AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
        <Tooltip content={<ChartTooltip />} />
        <Line type="monotone" dataKey="conversionRate" name="Conversion %" stroke="#18181b" strokeWidth={2} dot={{ r: 2, fill: "#18181b" }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
