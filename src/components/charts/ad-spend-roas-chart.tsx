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
import { GRID_PROPS, X_AXIS_STYLE, Y_AXIS_STYLE, formatCurrency } from "@/lib/chart-utils";
import { ChartLegend, useLegendToggle } from "./chart-legend";

interface DataPoint {
  bucket: string;
  label: string;
  fbSpend: number;
  igSpend: number;
  googleSpend: number;
  fbRoas: number;
  igRoas: number;
}

const SERIES = [
  { key: "fbSpend", label: "FB Spend", color: "#1d4ed8" },
  { key: "igSpend", label: "IG Spend", color: "#a855f7" },
  { key: "googleSpend", label: "Google Spend", color: "#f59e0b" },
  { key: "fbRoas", label: "FB ROAS", color: "#1d4ed8", dashed: true },
  { key: "igRoas", label: "IG ROAS", color: "#a855f7", dashed: true },
];

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium text-zinc-900">{label}</p>
      <div className="space-y-0.5">
        {(data?.fbSpend ?? 0) > 0 && (
          <p className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-700" />
            FB: {formatCurrency(data.fbSpend)}
            {data.fbRoas > 0 && <span className="text-zinc-400">({data.fbRoas.toFixed(1)}x)</span>}
          </p>
        )}
        {(data?.igSpend ?? 0) > 0 && (
          <p className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-purple-500" />
            IG: {formatCurrency(data.igSpend)}
            {data.igRoas > 0 && <span className="text-zinc-400">({data.igRoas.toFixed(1)}x)</span>}
          </p>
        )}
        {(data?.googleSpend ?? 0) > 0 && (
          <p className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Google: {formatCurrency(data.googleSpend)}
          </p>
        )}
      </div>
      <p className="mt-1 border-t border-zinc-100 pt-1 text-zinc-500">
        Total: {formatCurrency((data?.fbSpend ?? 0) + (data?.igSpend ?? 0) + (data?.googleSpend ?? 0))}
      </p>
    </div>
  );
}

export function AdSpendRoasChart({ data }: { data: DataPoint[] }) {
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
          {!isHidden("fbSpend") && (
            <Bar yAxisId="left" dataKey="fbSpend" name="FB Spend" fill="#1d4ed8" stackId="spend" radius={[0, 0, 0, 0]} barSize={20} />
          )}
          {!isHidden("igSpend") && (
            <Bar yAxisId="left" dataKey="igSpend" name="IG Spend" fill="#a855f7" stackId="spend" radius={[2, 2, 0, 0]} barSize={20} />
          )}
          {!isHidden("googleSpend") && (
            <Bar yAxisId="left" dataKey="googleSpend" name="Google Spend" fill="#f59e0b" stackId="spend" radius={[2, 2, 0, 0]} barSize={20} />
          )}
          {!isHidden("fbRoas") && (
            <Line yAxisId="right" type="monotone" dataKey="fbRoas" name="FB ROAS" stroke="#1d4ed8" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
          )}
          {!isHidden("igRoas") && (
            <Line yAxisId="right" type="monotone" dataKey="igRoas" name="IG ROAS" stroke="#a855f7" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
