"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { GRID_PROPS, X_AXIS_STYLE, Y_AXIS_STYLE, formatNumber } from "@/lib/chart-utils";

interface DataPoint {
  source: string;
  sessions: number;
  users: number;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-zinc-900">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey}>
          {p.name}: {formatNumber(p.value)}
        </p>
      ))}
    </div>
  );
}

export function TrafficSourcesChart({ data }: { data: DataPoint[] }) {
  if (data.length === 0) return <p className="py-8 text-center text-sm text-zinc-400">No traffic data for this period.</p>;

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} horizontal={false} />
        <XAxis type="number" tick={X_AXIS_STYLE} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="source" tick={Y_AXIS_STYLE} tickLine={false} axisLine={false} width={120} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="sessions" name="Sessions" fill="#18181b" radius={[0, 3, 3, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
