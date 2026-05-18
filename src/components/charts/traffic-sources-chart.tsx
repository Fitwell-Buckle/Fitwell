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
import { GRID_PROPS, X_AXIS_STYLE, Y_AXIS_STYLE, COLORS, formatNumber } from "@/lib/chart-utils";
import { ChartLegend, useLegendToggle } from "./chart-legend";

interface DataPoint {
  source: string;
  sessions: number;
  users: number;
}

const SERIES = [
  { key: "sessions", label: "Sessions", color: "#18181b" },
  { key: "users", label: "Users", color: COLORS.users },
];

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-zinc-900">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.fill }} />
          {p.name}: {formatNumber(p.value)}
        </p>
      ))}
    </div>
  );
}

export function TrafficSourcesChart({ data }: { data: DataPoint[] }) {
  const { isHidden, toggle, isolate } = useLegendToggle(SERIES.map((s) => s.key));

  if (data.length === 0) return <p className="py-8 text-center text-sm text-zinc-400">No traffic data for this period.</p>;

  return (
    <div>
      <ChartLegend items={SERIES} isHidden={isHidden} onToggle={toggle} onIsolate={isolate} />
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 32)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid {...GRID_PROPS} horizontal={false} />
          <XAxis type="number" tick={X_AXIS_STYLE} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="source" tick={Y_AXIS_STYLE} tickLine={false} axisLine={false} width={140} />
          <Tooltip content={<ChartTooltip />} />
          {!isHidden("sessions") && (
            <Bar dataKey="sessions" name="Sessions" fill="#18181b" radius={[0, 3, 3, 0]} barSize={12} />
          )}
          {!isHidden("users") && (
            <Bar dataKey="users" name="Users" fill={COLORS.users} radius={[0, 3, 3, 0]} barSize={12} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
