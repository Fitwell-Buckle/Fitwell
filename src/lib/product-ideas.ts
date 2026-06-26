// Product ideas: the road-map / idea-funnel stage before prototypes. Pure
// constants + helpers (no DB / server-only), so they're usable in client
// components and unit-testable. DB writes live in `product-ideas/service.ts`.

export const IDEA_STATUSES = [
  "idea",
  "under_review",
  "approved",
  "promoted",
  "parked",
] as const;

export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  idea: "Idea",
  under_review: "Under review",
  approved: "Approved",
  promoted: "Promoted",
  parked: "Parked",
};

export const IDEA_STATUS_BADGE: Record<IdeaStatus, string> = {
  idea: "bg-zinc-100 text-zinc-600",
  under_review: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  promoted: "bg-violet-100 text-violet-700",
  parked: "bg-zinc-100 text-zinc-400",
};

// Statuses a user sets directly. "promoted" is reached only via the
// promote-to-prototype action (it creates a prototype), so it's excluded.
export const EDITABLE_IDEA_STATUSES: IdeaStatus[] = [
  "idea",
  "under_review",
  "approved",
  "parked",
];

// An idea is still "open" (worth showing/working) unless promoted or parked.
export function isOpenIdeaStatus(status: string): boolean {
  return status !== "promoted" && status !== "parked";
}

export interface IceComponents {
  impact: number | null;
  confidence: number | null;
  ease: number | null;
}

// Combined ICE score = impact × confidence × ease (each 1–10 → 1…1000). Null
// unless all three are set, so partially-scored ideas don't rank as "0".
export function iceScore(c: IceComponents): number | null {
  if (c.impact == null || c.confidence == null || c.ease == null) return null;
  return c.impact * c.confidence * c.ease;
}

// Sort comparator for the ideas list: highest ICE first, unscored last, then
// newest first as a tiebreak. `createdAtMs` is a millisecond timestamp.
export function compareIdeasForList(
  a: IceComponents & { createdAtMs: number },
  b: IceComponents & { createdAtMs: number },
): number {
  const sa = iceScore(a);
  const sb = iceScore(b);
  if (sa !== sb) {
    if (sa == null) return 1;
    if (sb == null) return -1;
    return sb - sa;
  }
  return b.createdAtMs - a.createdAtMs;
}
