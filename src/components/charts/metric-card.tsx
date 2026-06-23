import { cn } from "@/lib/utils";
import { MetricSparkline, type MetricPoint } from "./metric-sparkline";

interface MetricCardProps {
  label: string;
  value: string;
  /** Small muted line under the value, e.g. a percentage of another metric. */
  caption?: string;
  trend?: {
    value: number;
    direction: "up" | "down";
  };
  className?: string;
  /** Per-bucket series for the graph view. */
  series?: MetricPoint[];
  /** How to format the series values in the chart tooltip. */
  seriesFormat?: "currency" | "number";
  /** Plot each point's `pct` as a second line (e.g. returns as % of D2C). */
  showPct?: boolean;
  /** When true (and `series` is present), render the line chart instead of the
   * big number + caption. Driven by the dashboard's table/graph toggle. */
  graph?: boolean;
  /** Line color for the graph view. */
  color?: string;
}

export function MetricCard({
  label,
  value,
  caption,
  trend,
  className,
  series,
  seriesFormat = "number",
  showPct,
  graph,
  color,
}: MetricCardProps) {
  const showGraph = Boolean(graph && series && series.length > 0);
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200/80 bg-white px-6 py-5 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]",
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </p>
      {showGraph ? (
        <>
          <p className="mt-2 font-mono text-lg font-medium tracking-tight text-zinc-900">
            {value}
          </p>
          <div className="mt-2">
            <MetricSparkline
              data={series!}
              format={seriesFormat}
              color={color}
              showPct={showPct}
            />
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 font-mono text-3xl font-medium tracking-tight text-zinc-900">
            {value}
          </p>
          {caption && (
            <p className="mt-1.5 text-xs font-medium text-zinc-400">{caption}</p>
          )}
          {trend && (
            <p
              className={cn(
                "mt-1.5 text-xs font-medium",
                trend.direction === "up" ? "text-zinc-900" : "text-zinc-400",
              )}
            >
              {trend.direction === "up" ? "↑" : "↓"}{" "}
              {Math.abs(trend.value)}% from last period
            </p>
          )}
        </>
      )}
    </div>
  );
}
