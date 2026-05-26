// Pure, DB-free influencer helpers: gifting-order number formatting, gift
// money math, content-deadline status, and status display. Kept side-effect-
// free so the Tracking page logic is unit-testable.

import { computeInvoiceTotals, type InvoiceTotals } from "@/lib/invoicing/invoicing";

// ─── Order lifecycle status ─────────────────────────────────────────

export const INFLUENCER_ORDER_STATUSES = ["draft", "sent", "cancelled"] as const;
export type InfluencerOrderStatus = (typeof INFLUENCER_ORDER_STATUSES)[number];

export const INFLUENCER_ORDER_STATUS_LABELS: Record<InfluencerOrderStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  cancelled: "Cancelled",
};

export function influencerOrderStatusBadgeClass(status: string): string {
  switch (status) {
    case "draft":
      return "bg-zinc-100 text-zinc-600";
    case "sent":
      return "bg-blue-50 text-blue-700";
    case "cancelled":
      return "bg-zinc-100 text-zinc-400";
    default:
      return "bg-zinc-100 text-zinc-600";
  }
}

/** Format a sequence value as a gifting-order number, e.g. 100 → "GIFT-00100". */
export function formatInfluencerOrderNumber(n: number): string {
  return `GIFT-${String(n).padStart(5, "0")}`;
}

// ─── Gift money math ────────────────────────────────────────────────

/** Retail (gift) value of the lines, the basis for reporting. */
export const GIFT_DISCOUNT_PERCENT = 100;

/**
 * Gifting totals: the subtotal is the retail gift value; a 100% discount makes
 * the total $0. Reuses the invoice math so rounding stays consistent.
 */
export function computeGiftTotals(
  lines: { quantity: number; unitPriceCents: number }[],
): InvoiceTotals {
  return computeInvoiceTotals(lines, GIFT_DISCOUNT_PERCENT);
}

// ─── Content-deadline status ────────────────────────────────────────

export const DEADLINE_STATUSES = [
  "hit",
  "missed",
  "approaching",
  "on_track",
  "no_deadline",
] as const;
export type DeadlineStatus = (typeof DEADLINE_STATUSES)[number];

export const DEADLINE_STATUS_LABELS: Record<DeadlineStatus, string> = {
  hit: "Published",
  missed: "Missed",
  approaching: "Due soon",
  on_track: "On track",
  no_deadline: "No deadline",
};

export function deadlineStatusBadgeClass(status: DeadlineStatus): string {
  switch (status) {
    case "hit":
      return "bg-emerald-50 text-emerald-700";
    case "missed":
      return "bg-red-50 text-red-700";
    case "approaching":
      return "bg-amber-50 text-amber-700";
    case "on_track":
      return "bg-blue-50 text-blue-700";
    case "no_deadline":
      return "bg-zinc-100 text-zinc-500";
  }
}

/** Whole-day difference b − a for two YYYY-MM-DD strings (UTC, drift-free). */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const aMs = Date.UTC(ay, am - 1, ad);
  const bMs = Date.UTC(by, bm - 1, bd);
  return Math.round((bMs - aMs) / (1000 * 60 * 60 * 24));
}

export interface DeadlineInput {
  /** YYYY-MM-DD when content is due, or null if none set. */
  contentDueDate: string | null;
  /** YYYY-MM-DD when content actually published, or null. */
  publishedAt: string | null;
  /** Today as YYYY-MM-DD (caller supplies, for testability). */
  today: string;
  /** How many days out counts as "approaching". Default 7. */
  approachingDays?: number;
}

/**
 * Classify an influencer order's content deadline:
 *  - published on/before due → "hit"; published after due → "missed"
 *  - not published, due passed → "missed"
 *  - not published, due within `approachingDays` → "approaching"
 *  - not published, due further out → "on_track"
 *  - no due date set → "no_deadline"
 * Drives the "who's approaching / missed / hit" grouping on the Tracking page.
 */
export function deadlineStatus({
  contentDueDate,
  publishedAt,
  today,
  approachingDays = 7,
}: DeadlineInput): DeadlineStatus {
  if (publishedAt) {
    if (contentDueDate && daysBetween(contentDueDate, publishedAt) > 0) {
      return "missed"; // published late
    }
    return "hit";
  }
  if (!contentDueDate) return "no_deadline";
  const daysOut = daysBetween(today, contentDueDate);
  if (daysOut < 0) return "missed";
  if (daysOut <= approachingDays) return "approaching";
  return "on_track";
}

/** Sort key so the most-urgent rows surface first (missed, then approaching…). */
export const DEADLINE_STATUS_ORDER: Record<DeadlineStatus, number> = {
  missed: 0,
  approaching: 1,
  on_track: 2,
  hit: 3,
  no_deadline: 4,
};
