/**
 * Creator scoring — pure functions implementing
 * specs/strategy/creator-scoring.md. Used by the CSV import
 * (scripts/import-creators-csv.ts) and the nightly stats-refresh cron so
 * scores stay current as platform stats drift.
 *
 * Changing weights or vocabulary? Read §8 of the scoring doc first —
 * re-weighting needs discussion with Greg, and vocabulary changes get
 * documented there with a date and rationale.
 */

export type Platform = "ig" | "yt" | "tt";
export type EmailKind = "business" | "personal" | "manager";
export type WatchConfidence = "high" | "medium" | "low" | "none";

// ─── §1 Watch-relevance keyword score ───────────────────────────────

// Tier A — distinctive watch vocabulary (default weight 5 unless noted)
const TIER_A: [string, number][] = [
  ["horology", 5],
  ["horological", 5],
  ["watchmaking", 5],
  ["watchmaker", 5],
  ["wristshot", 5],
  ["wristwatch", 5],
  ["microbrand", 5],
  ["micro brand", 5],
  ["micro-brand", 5],
  ["micro adjust", 5],
  ["micro-adjust", 5],
  ["deployant", 5],
  ["tang buckle", 5],
  ["pin buckle", 4],
  ["grand seiko", 5],
  ["audemars piguet", 5],
  ["patek philippe", 5],
  ["submariner", 4],
  ["speedmaster", 4],
  ["seamaster", 4],
  ["datejust", 4],
  ["tag heuer", 4],
  ["breitling", 4],
  ["longines", 4],
  ["tissot", 4],
  ["iwc", 4],
  ["jaeger lecoultre", 5],
  ["tourbillon", 5],
];

// Tier B — solid watch signal, more generic
const TIER_B: [string, number][] = [
  ["watch", 1],
  ["watches", 1],
  ["dive watch", 4],
  ["diver watch", 4],
  ["field watch", 4],
  ["dress watch", 4],
  ["pilot watch", 4],
  ["gmt watch", 4],
  ["mechanical watch", 4],
  ["automatic watch", 4],
  ["quartz watch", 3],
  ["chronograph", 3],
  ["gmt", 2],
  ["movement", 1],
  ["calibre", 3],
  ["caliber", 2],
  ["rolex", 4],
  ["seiko", 3],
  ["tudor", 2],
  ["omega", 2],
  ["hamilton", 1],
  ["casio", 2],
  ["g-shock", 4],
  ["cartier", 2],
  ["bezel", 2],
  ["dial", 1],
  ["lugs", 3],
  ["crown guard", 3],
];

// Tier C — adjacent / Fitwell-relevant
const TIER_C: [string, number][] = [
  ["apple watch", 3],
  ["smartwatch", 2],
  ["wearable", 1],
  ["wearables", 1],
  ["strap", 2],
  ["nato strap", 4],
  ["leather strap", 3],
  ["rubber strap", 3],
  ["buckle", 3],
  ["watch band", 4],
  ["edc", 2],
  ["everyday carry", 2],
  ["garmin", 2],
];

export const WATCH_KEYWORDS: [string, number][] = [
  ...TIER_A,
  ...TIER_B,
  ...TIER_C,
];

// "watch" as a verb — strip before counting (scoring doc §1).
const WATCH_VERB_PATTERNS = [
  /\bwatch\s+(this|me|out|as|how|now|today|live|the|him|her|them|us|next|more|my|our|video|along|here|it)\b/gi,
  /\bwatched\b/gi,
  /\bwatching\b/gi,
];

export function stripWatchVerbUsages(text: string): string {
  let out = text;
  for (const re of WATCH_VERB_PATTERNS) out = out.replace(re, " ");
  return out;
}

const keywordRegexCache = new Map<string, RegExp>();
function keywordRegex(keyword: string): RegExp {
  let re = keywordRegexCache.get(keyword);
  if (!re) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(`\\b${escaped}\\b`, "gi");
    keywordRegexCache.set(keyword, re);
  }
  return re;
}

/**
 * Weighted keyword score over bio/description/caption text.
 * `perKeywordCap`: 5 for bio-only inputs (IG), 8 for caption-heavy text.
 */
export function watchScore(text: string, perKeywordCap = 5): number {
  if (!text) return 0;
  const cleaned = stripWatchVerbUsages(text);
  let score = 0;
  for (const [keyword, weight] of WATCH_KEYWORDS) {
    const matches = cleaned.match(keywordRegex(keyword));
    if (matches) score += Math.min(matches.length, perKeywordCap) * weight;
  }
  return score;
}

/** Score → confidence bucket. IG thresholds are higher (more input text). */
export function watchConfidence(
  score: number,
  platform: Platform,
): WatchConfidence {
  const [high, medium, low] = platform === "yt" ? [40, 15, 5] : [60, 25, 8];
  if (score >= high) return "high";
  if (score >= medium) return "medium";
  if (score >= low) return "low";
  return "none";
}

// ─── §2 Engagement rate ─────────────────────────────────────────────

/** IG: mean((likes+comments)/followers)×100 over recent posts. */
export function igEngagementRate(
  posts: { likes: number | null; comments: number | null }[],
  followers: number,
): number | null {
  if (!followers || posts.length === 0) return null;
  const rates = posts.map(
    (p) => ((p.likes ?? 0) + (p.comments ?? 0)) / followers,
  );
  return (rates.reduce((a, b) => a + b, 0) / rates.length) * 100;
}

/** YT: mean((likes+comments)/views)×100 over videos in the window. */
export function ytEngagementRate(
  videos: { likes: number | null; comments: number | null; views: number | null }[],
): number | null {
  const usable = videos.filter((v) => (v.views ?? 0) > 0);
  if (usable.length === 0) return null;
  const rates = usable.map(
    (v) => (((v.likes ?? 0) + (v.comments ?? 0)) / v.views!) * 100,
  );
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}

// ─── §3 Composite fit_score components (each 0–100) ─────────────────

export function relevanceComponent(watchScoreValue: number): number {
  return Math.min(watchScoreValue, 250) / 2.5;
}

export function engagementComponent(erPct: number): number {
  return Math.min(erPct * 20, 100);
}

export function sizeFitComponent(followers: number): number {
  if (followers >= 10_000 && followers <= 100_000) return 100;
  if (followers >= 5_000 && followers < 10_000) return 80;
  if (followers > 100_000 && followers <= 250_000) return 80;
  if (followers > 250_000 && followers <= 500_000) return 65;
  if (followers > 500_000 && followers <= 1_000_000) return 50;
  if (followers > 1_000_000) return 30;
  if (followers >= 1_000) return 40;
  return 10;
}

export function activityComponent(daysSinceLastPost: number | null): number {
  if (daysSinceLastPost === null) return 0;
  if (daysSinceLastPost <= 14) return 100;
  if (daysSinceLastPost <= 30) return 85;
  if (daysSinceLastPost <= 60) return 65;
  if (daysSinceLastPost <= 90) return 45;
  if (daysSinceLastPost <= 180) return 20;
  return 5;
}

export function emailBonusComponent(kind: EmailKind | null): number {
  if (kind === "business") return 100;
  // Manager addresses are routed contacts, score like personal.
  if (kind === "personal" || kind === "manager") return 70;
  return 0;
}

export interface FitScoreInput {
  watchScore: number;
  followers: number;
  emailKind: EmailKind | null;
  /** null/undefined when the scrape had no post data (profile-only). */
  erPct?: number | null;
  /** null/undefined when no post dates are available. */
  daysSinceLastPost?: number | null;
}

export interface FitScoreResult {
  fitScore: number;
  /** True when engagement+activity were missing and weights renormalised. */
  partial: boolean;
}

/**
 * fit_score = relevance×0.30 + engagement×0.25 + size_fit×0.15
 *           + activity×0.10 + email_bonus×0.20
 * Profile-only rows (no engagement AND no activity) renormalise over the
 * remaining 65 points of weight (scoring doc §3 special case).
 */
export function fitScore(input: FitScoreInput): FitScoreResult {
  const relevance = relevanceComponent(input.watchScore);
  const sizeFit = sizeFitComponent(input.followers);
  const emailBonus = emailBonusComponent(input.emailKind);
  const hasEngagement = input.erPct !== null && input.erPct !== undefined;
  const hasActivity =
    input.daysSinceLastPost !== null && input.daysSinceLastPost !== undefined;

  if (!hasEngagement && !hasActivity) {
    return {
      fitScore: (relevance * 30 + sizeFit * 15 + emailBonus * 20) / 65,
      partial: true,
    };
  }

  const engagement = hasEngagement ? engagementComponent(input.erPct!) : 0;
  const activity = activityComponent(
    hasActivity ? input.daysSinceLastPost! : null,
  );
  return {
    fitScore:
      relevance * 0.3 +
      engagement * 0.25 +
      sizeFit * 0.15 +
      activity * 0.1 +
      emailBonus * 0.2,
    partial: false,
  };
}

// ─── §4 Cross-platform fit ──────────────────────────────────────────

export function crossPlatformFit(fitScores: number[]): number {
  const present = fitScores.filter((s) => Number.isFinite(s));
  if (present.length === 0) return 0;
  if (present.length === 1) return present[0];
  const best = Math.max(...present);
  const rest = present.filter((_, i) => i !== present.indexOf(best));
  return best + 0.2 * Math.max(...rest);
}

// ─── §5 Primary platform ────────────────────────────────────────────

export function primaryPlatform(
  igFollowers: number | null,
  ytSubscribers: number | null,
): Platform | null {
  if (igFollowers === null && ytSubscribers === null) return null;
  if (ytSubscribers === null) return "ig";
  if (igFollowers === null) return "yt";
  return ytSubscribers >= igFollowers ? "yt" : "ig";
}

// ─── §6 Brand-mention detection ─────────────────────────────────────

const MENTION_TERMS = [
  "fitwell",
  "@fitwellbuckle",
  "fitwellbuckle.co",
  "fitwell buckle",
];

export function mentionsFitwell(text: string | null | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return MENTION_TERMS.some((t) => lower.includes(t));
}

// ─── §7 Email extraction & classification ───────────────────────────

const BUSINESS_LOCAL_PARTS = [
  "business",
  "partnership",
  "pr",
  "press",
  "inquiries",
  "contact",
  "collab",
  "collabs",
  "sponsor",
  "marketing",
  "media",
  "hello",
  "info",
  "team",
  "booking",
  "sales",
];

export function classifyEmailKind(email: string): EmailKind {
  const local = email.toLowerCase().split("@")[0] ?? "";
  // Word-ish match so "pr" doesn't fire inside "april".
  const tokens = local.split(/[^a-z]+/).filter(Boolean);
  return BUSINESS_LOCAL_PARTS.some((b) => tokens.includes(b))
    ? "business"
    : "personal";
}

const STRICT_EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;

// Obfuscated form: explicit brackets around "at" required (scoring doc §7).
const OBFUSCATED_EMAIL_RE =
  /\b([A-Za-z0-9._%+\-]+)\s*[\[({<]\s*(?:at|@)\s*[\])}>]\s*([A-Za-z0-9.\-]+)\s*(?:[\[({<]\s*(?:dot|\.)\s*[\])}>]|\.)\s*([A-Za-z]{2,})\b/gi;

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".mp4", ".webp"];

const VALID_TLDS = new Set([
  "com",
  "net",
  "org",
  "io",
  "co",
  "me",
  "tv",
  "info",
  "biz",
  "email",
  "shop",
  "store",
  "studio",
  "agency",
  "watch",
]);

function isValidEmailCandidate(email: string): boolean {
  const lower = email.toLowerCase();
  const [local, domain] = lower.split("@");
  if (!local || local.length < 2 || !domain) return false;
  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return false;
  const tld = domain.split(".").pop() ?? "";
  // Named gTLDs plus any two-letter country code.
  return VALID_TLDS.has(tld) || /^[a-z]{2}$/.test(tld);
}

/** Extract deduped, lowercased emails from bio/caption text. */
export function extractEmails(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const m of text.match(STRICT_EMAIL_RE) ?? []) {
    const email = m.toLowerCase();
    if (isValidEmailCandidate(email)) found.add(email);
  }
  for (const m of text.matchAll(OBFUSCATED_EMAIL_RE)) {
    const email = `${m[1]}@${m[2]}.${m[3]}`.toLowerCase();
    if (isValidEmailCandidate(email)) found.add(email);
  }
  return [...found];
}

/** Business addresses win; first-seen order breaks ties. */
export function chooseEmail(emails: string[]): string | null {
  if (emails.length === 0) return null;
  return (
    emails.find((e) => classifyEmailKind(e) === "business") ?? emails[0]
  );
}

// ─── Handle normalization (import + post detection share this) ──────

export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@+/, "").toLowerCase();
}
