export type Granularity = "day" | "week" | "month";

export interface DateRange {
  from: Date;
  to: Date;
  granularity: Granularity;
  label: string;
}

export function parseDateRange(
  params: Record<string, string | string[] | undefined>,
): DateRange {
  const now = new Date();
  // Treat an explicit `to` date as the END of that day (inclusive) so a range
  // like from=to=today captures all of today, not just its midnight instant.
  const to =
    typeof params.to === "string"
      ? new Date(new Date(params.to).getTime() + 24 * 60 * 60 * 1000 - 1)
      : now;

  let from: Date;
  if (typeof params.from === "string") {
    from = new Date(params.from);
  } else {
    from = new Date();
    from.setDate(from.getDate() - 30);
  }

  const days = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

  let granularity: Granularity;
  if (typeof params.g === "string" && ["day", "week", "month"].includes(params.g)) {
    granularity = params.g as Granularity;
  } else if (days <= 30) {
    granularity = "day";
  } else if (days <= 90) {
    granularity = "week";
  } else {
    granularity = "month";
  }

  return { from, to, granularity, label: "Custom" };
}
