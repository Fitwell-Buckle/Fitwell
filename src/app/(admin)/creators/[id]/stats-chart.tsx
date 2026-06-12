"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface StatsPoint {
  date: string; // YYYY-MM-DD
  followers: number | null;
  erPct: number | null;
}

/**
 * 90-day followers + ER trend for one platform. Sparse until the refresh
 * crons accumulate history (one point per day from 2026-06-12 onward).
 */
export function StatsChart({
  label,
  points,
}: {
  label: string;
  points: StatsPoint[];
}) {
  if (points.length < 2) {
    return (
      <p className="text-xs text-zinc-400">
        {label}: trend chart appears once a few daily snapshots accumulate
        ({points.length}/2 so far).
      </p>
    );
  }
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        {label} — followers & ER% (90d)
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10 }}
            tickFormatter={(d: string) => d.slice(5)}
            minTickGap={24}
          />
          <YAxis
            yAxisId="followers"
            tick={{ fontSize: 10 }}
            width={44}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)
            }
          />
          <YAxis yAxisId="er" orientation="right" tick={{ fontSize: 10 }} width={32} />
          <Tooltip
            formatter={(value, name) => {
              const n = typeof value === "number" ? value : Number(value);
              if (!Number.isFinite(n)) return String(value ?? "—");
              return name === "ER%" ? `${n.toFixed(2)}%` : n.toLocaleString();
            }}
          />
          <Line
            yAxisId="followers"
            type="monotone"
            dataKey="followers"
            name="Followers"
            stroke="#18181b"
            strokeWidth={1.5}
            dot={false}
          />
          <Line
            yAxisId="er"
            type="monotone"
            dataKey="erPct"
            name="ER%"
            stroke="#c08a4d"
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
