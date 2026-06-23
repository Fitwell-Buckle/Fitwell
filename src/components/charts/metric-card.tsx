import { cn } from "@/lib/utils";

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
}

export function MetricCard({
  label,
  value,
  caption,
  trend,
  className,
}: MetricCardProps) {
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
    </div>
  );
}
