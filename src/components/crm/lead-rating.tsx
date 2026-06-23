import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FOLLOW_UP_TEMP_LABELS,
  LEAD_VALUE_MAX,
  type FollowUpTemp,
} from "@/lib/tradeshows/constants";

// Read-only display of a lead's triage rating (1–5 stars) plus its
// hot/warm/cold temperature chip. Both come from the trade-show vendor the
// lead was promoted from; either may be absent. Server-component safe.
const TEMP_CHIP: Record<FollowUpTemp, string> = {
  hot: "bg-red-50 text-red-700",
  warm: "bg-amber-50 text-amber-700",
  cold: "bg-sky-50 text-sky-700",
};

export function LeadRating({
  value,
  temp,
}: {
  value: number | null;
  temp: string | null;
}) {
  const tempKey =
    temp && temp in FOLLOW_UP_TEMP_LABELS ? (temp as FollowUpTemp) : null;

  if (value == null && !tempKey) {
    return <span className="text-xs text-zinc-300">—</span>;
  }

  return (
    <div className="flex items-center gap-2">
      {value != null && (
        <span
          className="flex items-center"
          aria-label={`${value} of ${LEAD_VALUE_MAX} stars`}
          title={`${value}/${LEAD_VALUE_MAX}`}
        >
          {Array.from({ length: LEAD_VALUE_MAX }, (_, i) => (
            <Star
              key={i}
              className={cn(
                "h-3.5 w-3.5",
                i < value ? "fill-amber-400 text-amber-400" : "text-zinc-200",
              )}
            />
          ))}
        </span>
      )}
      {tempKey && (
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-xs font-medium",
            TEMP_CHIP[tempKey],
          )}
        >
          {FOLLOW_UP_TEMP_LABELS[tempKey]}
        </span>
      )}
    </div>
  );
}
