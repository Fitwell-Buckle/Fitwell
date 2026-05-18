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
import { GRID_PROPS, X_AXIS_STYLE, Y_AXIS_STYLE, formatCurrency } from "@/lib/chart-utils";
import { ChartLegend, useLegendToggle } from "./chart-legend";

interface DataPoint {
  bucket: string;
  label: string;
  wholesale: number;
  organic: number;
  meta: number;
  google: number;
}

const SERIES = [
  { key: "wholesale", label: "Wholesale", color: "#a1a1aa" },
  { key: "organic", label: "DTC Organic", color: "#18181b" },
  { key: "meta", label: "DTC Meta", color: "#3b82f6" },
  { key: "google", label: "DTC Google", color: "#f59e0b" },
];

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum: number, p: any) => sum + (p.value ?? 0), 0);
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-zinc-900">{label}</p>
      {payload.filter((p: any) => p.value > 0).map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
      <p className="mt-1 border-t border-zinc-100 pt-1 font-medium">
        Total: {formatCurrency(total)}
      </p>
    </div>
  );
}

export function RevenueTrendChart({ data }: { data: DataPoint[] }) {
  const { isHidden, toggle, isolate } = useLegendToggle(SERIES.map((s) => s.key), ["wholesale"]);

  if (data.length === 0) return <p className="py-8 text-center text-sm text-zinc-400">No revenue data for this period.</p>;

  return (
    <div>
      <ChartLegend items={SERIES} isHidden={isHidden} onToggle={toggle} onIsolate={isolate} />
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" tick={X_AXIS_STYLE} tickLine={false} axisLine={false} />
          <YAxis tick={Y_AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 100).toLocaleString()}`} />
          <Tooltip content={<ChartTooltip />} />
          {!isHidden("wholesale") && (
            <Area type="monotone" dataKey="wholesale" name="Wholesale" stackId="1" fill="#a1a1aa" stroke="#a1a1aa" fillOpacity={0.2} />
          )}
          {!isHidden("organic") && (
            <Area type="monotone" dataKey="organic" name="DTC Organic" stackId="1" fill="#18181b" stroke="#18181b" fillOpacity={0.15} />
          )}
          {!isHidden("meta") && (
            <Area type="monotone" dataKey="meta" name="DTC Meta" stackId="1" fill="#3b82f6" stroke="#3b82f6" fillOpacity={0.2} />
          )}
          {!isHidden("google") && (
            <Area type="monotone" dataKey="google" name="DTC Google" stackId="1" fill="#f59e0b" stroke="#f59e0b" fillOpacity={0.2} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
