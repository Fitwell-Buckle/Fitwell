import { storeDayStartUtc, storeDayEndUtc } from "@/lib/timezone";

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
  // `from`/`to` arrive as YYYY-MM-DD calendar dates and are interpreted as
  // *store-local* days (see src/lib/timezone.ts), then converted to the UTC
  // instants that bound that day. `to` is the inclusive end of its day, so
  // from=to=today captures the whole store day — not just its midnight instant.
  // This is what makes "Today" reconcile with Shopify instead of reading $0
  // during the evening-Pacific UTC rollover.
  const to = typeof params.to === "string" ? storeDayEndUtc(params.to) : now;

  let from: Date;
  if (typeof params.from === "string") {
    from = storeDayStartUtc(params.from);
  } else {
    // No explicit range: a rolling 30×24h window ending now.
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
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
