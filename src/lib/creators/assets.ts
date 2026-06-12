/**
 * Asset capture + rights tracking (creator program Phase 6). Assets are
 * pointers (Drive/Dropbox URLs) per the spec's MVP decision — we display
 * rights status and warn on expiry; we can't physically prevent use of an
 * expired asset (that would need S3 + signed URLs, revisit if rights
 * enforcement becomes real).
 */

export const ASSET_TYPES = ["raw", "edited", "both"] as const;

export const RIGHTS_TIERS = [
  "organic_only",
  "paid_30d",
  "paid_90d",
  "perpetual",
] as const;
export type RightsTier = (typeof RIGHTS_TIERS)[number];

export const RIGHTS_TIER_LABELS: Record<RightsTier, string> = {
  organic_only: "Organic only",
  paid_30d: "Paid · 30 days",
  paid_90d: "Paid · 90 days",
  perpetual: "Perpetual",
};

/** Days before expiry when an asset counts as "expiring soon". */
export const EXPIRY_WARNING_DAYS = 14;

/**
 * When paid-usage rights run out, computed from the receive date.
 * null = no expiry applies (perpetual, or organic-only which never had
 * paid rights to begin with).
 */
export function rightsExpiresAt(
  tier: RightsTier,
  receivedAt: Date,
): Date | null {
  switch (tier) {
    case "paid_30d":
      return new Date(receivedAt.getTime() + 30 * 86_400_000);
    case "paid_90d":
      return new Date(receivedAt.getTime() + 90 * 86_400_000);
    case "organic_only":
    case "perpetual":
      return null;
  }
}

export type RightsStatus =
  | "organic_only" // never usable in paid placements
  | "active"
  | "expiring_soon"
  | "expired";

export function rightsStatus(
  tier: RightsTier,
  expiresAt: Date | null,
  now: Date = new Date(),
): RightsStatus {
  if (tier === "organic_only") return "organic_only";
  if (!expiresAt) return "active"; // perpetual
  if (expiresAt <= now) return "expired";
  const warningStart = expiresAt.getTime() - EXPIRY_WARNING_DAYS * 86_400_000;
  return now.getTime() >= warningStart ? "expiring_soon" : "active";
}
