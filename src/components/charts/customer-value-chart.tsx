"use client";

import { useState } from "react";
import {
  SegmentLineChart,
  type SegmentPoint,
  type SegmentFormat,
} from "./segment-line-chart";

export interface SegmentBucket {
  revenue: number; // cents, net
  customers: number;
  orders: number;
  products: number;
}

export interface CustomerValuePoint {
  label: string;
  d2c: SegmentBucket;
  tradeshow: SegmentBucket;
  b2b: SegmentBucket;
}

const METRICS: {
  key: string;
  label: string;
  format: SegmentFormat;
  value: (s: SegmentBucket) => number;
}[] = [
  {
    key: "avgRevenue",
    label: "Avg revenue / customer",
    format: "currency",
    value: (s) => (s.customers > 0 ? Math.round(s.revenue / s.customers) : 0),
  },
  {
    key: "customers",
    label: "Customers",
    format: "number",
    value: (s) => s.customers,
  },
  {
    key: "avgOrders",
    label: "Avg orders / customer",
    format: "decimal",
    value: (s) => (s.customers > 0 ? s.orders / s.customers : 0),
  },
  {
    key: "avgProducts",
    label: "Avg products / customer",
    format: "decimal",
    value: (s) => (s.customers > 0 ? s.products / s.customers : 0),
  },
];

/**
 * Customer Value & Retention as a per-segment line chart, with an on-chart
 * toggle to switch which metric the lines plot (defaults to avg revenue /
 * customer). Per-bucket per-segment, so it approximates — not equals — the
 * cohort-bucketed table (a customer can appear in multiple buckets/segments).
 */
export function CustomerValueChart({
  data,
  segment = "all",
}: {
  data: CustomerValuePoint[];
  /** When set to one segment, only that line is drawn. */
  segment?: "all" | "d2c" | "tradeshow" | "b2b";
}) {
  const [metricKey, setMetricKey] = useState(METRICS[0].key);
  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];
  const chartData: SegmentPoint[] = data.map((p) => ({
    label: p.label,
    d2c: metric.value(p.d2c),
    tradeshow: metric.value(p.tradeshow),
    b2b: metric.value(p.b2b),
  }));
  const show = segment === "all" ? undefined : [segment];
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetricKey(m.key)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              m.key === metricKey
                ? "bg-brand text-white"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
            }`}
            aria-pressed={m.key === metricKey}
          >
            {m.label}
          </button>
        ))}
      </div>
      <SegmentLineChart data={chartData} format={metric.format} show={show} />
    </div>
  );
}
