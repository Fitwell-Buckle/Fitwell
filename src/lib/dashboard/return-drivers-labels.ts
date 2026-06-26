/**
 * Single source of truth for the Return Drivers segment labels + the URL-param
 * codec used to filter the dashboard by a clicked segment. Pure (no DB/server
 * imports) so it's shared by the metric SQL (return-drivers.ts), the filter SQL
 * (return-drivers-filter.ts), and the clickable component — guaranteeing the
 * labels a query emits are exactly the values the filter matches on.
 */

// Fixed-label dimensions (the SQL CASE expressions bind these exact strings, so
// a row's display label is byte-identical to the value the filter compares to).
export const FAMILY = {
  m1: "M1 Buckle",
  m4: "M4 Universal Link",
  tang: "Tang (accessory)",
  other: "Other",
} as const;

export const COLOR = {
  silver: "Silver",
  black: "Black",
  rose: "Rose Gold",
  yellow: "Yellow Gold",
} as const;

export const TOD = {
  morning: "Morning (5–12)",
  afternoon: "Afternoon (12–5)",
  evening: "Evening (5–10)",
  late: "Late night (10–5)",
} as const;

export const LAT = {
  d7: "≤ 7 days",
  d14: "8–14 days",
  d30: "15–30 days",
  d60: "31–60 days",
  d61: "60+ days",
} as const;

export const BASKET = {
  one: "1 product",
  two: "2 products",
  three: "3 products",
  four: "4+ products",
} as const;

export const SOURCE = {
  instagram: "Instagram",
  email: "Email",
  facebook: "Facebook/Meta",
  google: "Google",
  youtube: "YouTube",
  direct: "Direct",
  other: "Other",
} as const;

export const NO_SIZE = "(no size)";

/** The nine filterable dimensions; also the per-block key in the component. */
export const RD_DIMS = [
  "family",
  "size",
  "color",
  "basket",
  "latency",
  "source",
  "tod",
  "dow",
  "country",
] as const;
export type RdDim = (typeof RD_DIMS)[number];

const SEP = "|"; // no segment label contains a pipe

/** Encode a clicked segment into the `rd` URL param value. */
export function rdParam(dim: RdDim, value: string): string {
  return `${dim}${SEP}${value}`;
}

/** Decode the `rd` URL param back into a dim + value, or null if malformed. */
export function parseRd(
  raw: string | string[] | undefined | null,
): { dim: RdDim; value: string } | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const i = raw.indexOf(SEP);
  if (i <= 0 || i === raw.length - 1) return null;
  const dim = raw.slice(0, i);
  const value = raw.slice(i + 1);
  if (!(RD_DIMS as readonly string[]).includes(dim)) return null;
  return { dim: dim as RdDim, value };
}
