// Shared constants + helpers for the prototype management system.
//
// A prototype is a proposed SKU that doesn't exist in Shopify yet. A vendor
// makes physical samples across one or more rounds until we approve it, then
// record the final SKU and create the real product in Shopify manually.

export const PROTOTYPE_STATUSES = [
  "concept",
  "in_development",
  "approved",
  "rejected",
  "on_hold",
] as const;

export type PrototypeStatus = (typeof PROTOTYPE_STATUSES)[number];

export const PROTOTYPE_STATUS_LABELS: Record<PrototypeStatus, string> = {
  concept: "Concept",
  in_development: "In development",
  approved: "Approved",
  rejected: "Rejected",
  on_hold: "On hold",
};

// Tailwind classes for status badges, shared by the list + detail UIs.
export const PROTOTYPE_STATUS_BADGE: Record<PrototypeStatus, string> = {
  concept: "bg-zinc-100 text-zinc-600",
  in_development: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  on_hold: "bg-amber-100 text-amber-700",
};

export const ROUND_STATUSES = [
  "requested",
  "in_production",
  "shipped",
  "received",
  "reviewed",
] as const;

export type RoundStatus = (typeof ROUND_STATUSES)[number];

export const ROUND_STATUS_LABELS: Record<RoundStatus, string> = {
  requested: "Requested",
  in_production: "In production",
  shipped: "Shipped",
  received: "Received",
  reviewed: "Reviewed",
};

export const ROUND_STATUS_BADGE: Record<RoundStatus, string> = {
  requested: "bg-zinc-100 text-zinc-600",
  in_production: "bg-blue-100 text-blue-700",
  shipped: "bg-indigo-100 text-indigo-700",
  received: "bg-violet-100 text-violet-700",
  reviewed: "bg-green-100 text-green-700",
};

// Statuses that mean the prototype is closed out (no longer active work).
export const TERMINAL_PROTOTYPE_STATUSES: PrototypeStatus[] = [
  "approved",
  "rejected",
];

export function isActivePrototypeStatus(status: string): boolean {
  return !TERMINAL_PROTOTYPE_STATUSES.includes(status as PrototypeStatus);
}

export interface PromotionInput {
  status: string;
  finalSku?: string | null;
}

export interface PromotionResult {
  ok: boolean;
  error?: string;
  // Fields to persist when approving — caller spreads these into the update.
  fields?: { status: "approved"; finalSku: string; approvedAt: Date };
}

// Validates a request to approve (promote) a prototype to a real product.
// Approval requires a final SKU — that's the value we'll create in Shopify.
export function approvePrototype(
  input: PromotionInput,
  now: Date,
): PromotionResult {
  const finalSku = input.finalSku?.trim();
  if (!finalSku) {
    return { ok: false, error: "A final SKU is required to approve a prototype." };
  }
  return {
    ok: true,
    fields: { status: "approved", finalSku, approvedAt: now },
  };
}

// Next round number for a prototype given its existing rounds (1-based).
export function nextRoundNumber(existing: { roundNumber: number }[]): number {
  if (existing.length === 0) return 1;
  return Math.max(...existing.map((r) => r.roundNumber)) + 1;
}

// The candidate vendor ids to attach to a prototype: the selected set plus the
// awarded vendor (the award is always a candidate by definition), de-duplicated
// and with empty/falsy ids dropped. Order-preserving (selected first).
export function mergeCandidateVendorIds(
  supplierIds: string[] | undefined,
  awardedId: string | null | undefined,
): string[] {
  return [...new Set([...(supplierIds ?? []), awardedId ?? ""].filter(Boolean))];
}
