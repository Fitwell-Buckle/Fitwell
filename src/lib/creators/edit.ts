/**
 * Pure helpers for editing creators — rollup recomputation after a
 * platform is split off / reassigned / deleted, and the heuristic that
 * flags multi-platform records that look like two different entities got
 * merged (the "Watch Couple IG + 1916 Company YT" import problem).
 *
 * Kept pure so the API routes can stay thin and these stay unit-testable
 * without a database. Scoring formulas live in scoring.ts; this only
 * re-derives the creator-level rollups (cross_platform_fit, primary
 * platform) from whatever platforms remain.
 */

import { crossPlatformFit, normalizeHandle, type Platform } from "./scoring";

/** Minimal shape needed to recompute creator-level rollups. */
export interface PlatformForRollup {
  platform: string;
  fitScore: number | null;
  /** Latest follower/subscriber count, if known — breaks the primary tie. */
  followers: number | null;
}

/**
 * Pick the primary platform from whatever platforms a creator has left.
 * One platform → that one. Otherwise the highest-followers platform,
 * falling back to highest fit, then to a stable platform order. Null when
 * the creator has no platforms (e.g. the last one was split off).
 */
export function pickPrimaryPlatform(
  platforms: PlatformForRollup[],
): string | null {
  if (platforms.length === 0) return null;
  if (platforms.length === 1) return platforms[0].platform;

  const score = (p: PlatformForRollup): [number, number] => [
    p.followers ?? -1,
    p.fitScore ?? -1,
  ];
  // Stable order for the final tiebreak so re-runs are deterministic.
  const order: Record<string, number> = { yt: 0, ig: 1, tt: 2 };
  return [...platforms].sort((a, b) => {
    const [af, aFit] = score(a);
    const [bf, bFit] = score(b);
    if (af !== bf) return bf - af;
    if (aFit !== bFit) return bFit - aFit;
    return (order[a.platform] ?? 9) - (order[b.platform] ?? 9);
  })[0].platform;
}

/** Re-derive the creator-level rollups from the platforms it now owns. */
export function recomputeRollups(platforms: PlatformForRollup[]): {
  crossPlatformFit: number | null;
  primaryPlatform: string | null;
} {
  if (platforms.length === 0) {
    return { crossPlatformFit: null, primaryPlatform: null };
  }
  return {
    crossPlatformFit: crossPlatformFit(
      platforms.map((p) => p.fitScore ?? NaN),
    ),
    primaryPlatform: pickPrimaryPlatform(platforms),
  };
}

/**
 * Name for a creator created by splitting a platform off. Prefer the
 * handle (humanised), falling back to a placeholder so the row is never
 * nameless in the list.
 */
export function deriveNameFromHandle(
  handle: string,
  platform: string,
): string {
  const h = normalizeHandle(handle);
  return h ? `@${h} (${platform})` : `Untitled ${platform} creator`;
}

/**
 * Split a creator's free-text name into first/last for the CRM lead/customer
 * record it converts into. First token → firstName, the rest → lastName.
 * A single-token name (a brand like "The Watch Couple") becomes firstName
 * only, lastName null — the CRM treats companyName separately anyway.
 */
export function splitName(name: string): {
  firstName: string | null;
  lastName: string | null;
} {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// ─── Possible-mismatch heuristic ────────────────────────────────────

const STOPWORDS = new Set([
  "the",
  "official",
  "real",
  "watch",
  "watches",
  "company",
  "co",
  "tv",
  "yt",
  "ig",
  "channel",
  "studio",
  "media",
  "and",
]);

/** Split a handle/name into normalized word tokens ≥3 chars, minus noise. */
function tokenize(value: string): Set<string> {
  const tokens = value
    .toLowerCase()
    .replace(/[@_.]/g, " ")
    // split camelCase and digit boundaries: "the1916company" → the 1916 company
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return new Set(tokens);
}

/**
 * Two tokens are "related" if equal, or one contains the other and the
 * shorter is ≥4 chars. Substring containment catches concatenated handles
 * (name "Bark and Jack" → token "bark" lives inside handle "barkandjack")
 * without firing on short coincidences.
 */
function tokensRelated(x: string, y: string): boolean {
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 4 && long.includes(short);
}

function shareToken(a: Set<string>, b: Set<string>): boolean {
  for (const t of a) for (const u of b) if (tokensRelated(t, u)) return true;
  return false;
}

export interface PlatformIdentity {
  platform: string;
  handle: string;
}

/**
 * Flag a multi-platform creator whose platforms look like *different*
 * entities merged by the import — the Watch Couple (IG) wrongly carrying
 * the 1916 Company (YT). Conservative: only fires when no two platform
 * handles share a meaningful token AND no handle shares a token with the
 * creator's name. Single-platform creators never flag.
 *
 * It surfaces suspects for a human to split; it never acts on its own.
 */
export function flagPossibleMismatch(
  name: string,
  platforms: PlatformIdentity[],
): boolean {
  if (platforms.length < 2) return false;

  const handleTokens = platforms.map((p) => tokenize(p.handle));
  const nameTokens = tokenize(name);

  // If any two handles share a token, they're plausibly the same brand.
  for (let i = 0; i < handleTokens.length; i++) {
    for (let j = i + 1; j < handleTokens.length; j++) {
      if (shareToken(handleTokens[i], handleTokens[j])) return false;
    }
  }
  // If every handle shares a token with the name, also plausibly fine.
  if (
    nameTokens.size > 0 &&
    handleTokens.every((h) => shareToken(h, nameTokens))
  ) {
    return false;
  }
  return true;
}

/** Re-export so callers don't reach past this module for the platform type. */
export type { Platform };
