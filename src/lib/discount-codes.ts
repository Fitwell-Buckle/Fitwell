// Discount-code family classification — computed at query time, never
// stored (denormalized families drift as creators are added; see
// specs/work-plans/todo/discount-code-visibility.md).
//
// Bucketing convention (decided 2026-06-09, retention-led recal session;
// service + event families added 2026-06-10 from backfill data, Tom's call):
// - All review-reward codes collapse into one `review` bucket — each
//   reviewer gets a unique code, individually meaningless.
// - Creator codes stay per-creator (`creatorSlug`), tagged `creator` for
//   family-level rollups. The creator program's generated-codes table
//   will join on the normalized code string when it lands.
// - `service` = CS make-goods and manual staff discounts — excluded from
//   the marketing split so they don't pollute the C1 measurement.
// - `event` = in-person event codes (Windup SF, Geneva) — offline
//   acquisition, distinct from any online channel.

export type DiscountCodeFamily =
  | "welcome"
  | "creator"
  | "review"
  | "service"
  | "event"
  | "other";

export interface DiscountCodeClass {
  family: DiscountCodeFamily;
  /** Set when family === 'creator' — the matched creator prefix. */
  creatorSlug?: string;
}

// The shared Klaviyo welcome-flow code (Tom 2026-06-10; confirmed as the
// dominant non-event signup code in the 60-day backfill).
export const WELCOME_CODES: ReadonlySet<string> = new Set(["welcome15"]);

// Review-reward codes. Tom reported JM-xxxxxxx; the 60-day backfill shows
// review-xxxxxxx (Judge.me format presumably changed at some point) —
// accept both.
const REVIEW_CODE_PATTERN = /^(jm-|review-)/;

// CS make-goods + manual staff discounts (observed in backfill 2026-06-10).
// Extend as ops mints new ones — they typically end in "100" (100% off).
export const SERVICE_CODES: ReadonlySet<string> = new Set([
  "mispack100",
  "lostshipment100",
  "return100",
  "defective100",
  "replacement",
  "tradesample100",
  "discount",
  "custom discount",
]);

// In-person event codes. sf15 = Windup Watch Fair SF (everyone who bought
// there got 15% via this code — Tom 2026-06-10); geneva15 = Geneva.
export const EVENT_CODES: ReadonlySet<string> = new Set(["sf15", "geneva15"]);

// Seed list from the 2026-06-09 session (watchbros15, watchchris20, …).
// Grows as creator codes ship; superseded by the creator program's
// generated-codes table as the source of truth once that lands.
export const CREATOR_CODE_PREFIXES: readonly string[] = [
  "watchbros",
  "watchchris",
];

export function normalizeDiscountCode(code: string): string {
  return code.trim().toLowerCase();
}

export const FAMILY_LABELS: Record<DiscountCodeFamily, string> = {
  welcome: "Welcome flow",
  creator: "Creator codes",
  review: "Review rewards",
  event: "In-person events",
  service: "CS / make-goods",
  other: "Other codes",
};

export function classifyDiscountCode(
  code: string,
  opts?: {
    welcomeCodes?: ReadonlySet<string>;
    creatorPrefixes?: readonly string[];
  },
): DiscountCodeClass {
  const normalized = normalizeDiscountCode(code);
  const welcomeCodes = opts?.welcomeCodes ?? WELCOME_CODES;
  const creatorPrefixes = opts?.creatorPrefixes ?? CREATOR_CODE_PREFIXES;

  if (welcomeCodes.has(normalized)) return { family: "welcome" };
  if (SERVICE_CODES.has(normalized)) return { family: "service" };
  if (EVENT_CODES.has(normalized)) return { family: "event" };
  if (REVIEW_CODE_PATTERN.test(normalized)) return { family: "review" };

  const prefix = creatorPrefixes.find((p) => normalized.startsWith(p));
  if (prefix) return { family: "creator", creatorSlug: prefix };

  return { family: "other" };
}

// ─── First-order discount split (360 W5 §6 — C1 measurement) ────────

/** One row per (first order × redeemed code); code null = no code. */
export interface FirstOrderCodeRow {
  orderId: string;
  code: string | null;
  amountCents: number | null;
}

export interface DiscountFamilyAgg {
  family: DiscountCodeFamily;
  orders: number;
  pctOfFirstOrders: number;
  discountCents: number;
  /** Per-creator rollup, only on the `creator` family. */
  creators?: Array<{ slug: string; orders: number }>;
}

export interface FirstOrderDiscountSplit {
  totalFirstOrders: number;
  withCode: number;
  noCode: number;
  families: DiscountFamilyAgg[];
}

// A multi-code order counts once, under its most marketing-specific
// family. Creator outranks welcome: a creator code stacked with the
// welcome code signals creator-driven acquisition.
const FAMILY_PRIORITY: readonly DiscountCodeFamily[] = [
  "creator",
  "welcome",
  "review",
  "event",
  "service",
  "other",
];

export function aggregateFirstOrderDiscountSplit(
  rows: FirstOrderCodeRow[],
): FirstOrderDiscountSplit {
  const byOrder = new Map<
    string,
    Array<{ code: string; amountCents: number }>
  >();
  for (const r of rows) {
    if (!byOrder.has(r.orderId)) byOrder.set(r.orderId, []);
    if (r.code !== null) {
      byOrder.get(r.orderId)!.push({
        code: r.code,
        amountCents: r.amountCents ?? 0,
      });
    }
  }

  const totals = new Map<
    DiscountCodeFamily,
    { orders: number; discountCents: number; creators: Map<string, number> }
  >();
  let withCode = 0;

  for (const codes of byOrder.values()) {
    if (codes.length === 0) continue;
    withCode++;

    const classes = codes.map((c) => classifyDiscountCode(c.code));
    const family =
      FAMILY_PRIORITY.find((f) => classes.some((c) => c.family === f)) ??
      "other";
    const slug =
      family === "creator"
        ? classes.find((c) => c.family === "creator")?.creatorSlug
        : undefined;
    const discountCents = codes.reduce((s, c) => s + c.amountCents, 0);

    const agg = totals.get(family) ?? {
      orders: 0,
      discountCents: 0,
      creators: new Map<string, number>(),
    };
    agg.orders++;
    agg.discountCents += discountCents;
    if (slug) agg.creators.set(slug, (agg.creators.get(slug) ?? 0) + 1);
    totals.set(family, agg);
  }

  const totalFirstOrders = byOrder.size;
  const families: DiscountFamilyAgg[] = FAMILY_PRIORITY.filter((f) =>
    totals.has(f),
  ).map((f) => {
    const agg = totals.get(f)!;
    return {
      family: f,
      orders: agg.orders,
      pctOfFirstOrders:
        totalFirstOrders > 0 ? (100 * agg.orders) / totalFirstOrders : 0,
      discountCents: agg.discountCents,
      ...(f === "creator" && agg.creators.size > 0
        ? {
            creators: [...agg.creators.entries()]
              .map(([slug, orders]) => ({ slug, orders }))
              .sort((a, b) => b.orders - a.orders),
          }
        : {}),
    };
  });
  families.sort((a, b) => b.orders - a.orders);

  return {
    totalFirstOrders,
    withCode,
    noCode: totalFirstOrders - withCode,
    families,
  };
}
