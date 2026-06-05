// Maps Grapevine post-purchase survey answers to two complementary fields:
//
//   - platformHint: the self-reported platform (e.g. 'instagram', 'google_search').
//     ALWAYS set when the answer reveals a platform, even if the survey can't tell
//     us paid vs organic. The attribution engine (link_method='self_report')
//     joins this with utm_attribution + landing-site context to commit to a
//     specific funnel.md channel like paid_meta_cold vs organic_meta.
//
//   - channelHint: a canonical channel ID from specs/strategy/funnel.md.
//     Only set when the survey answer commits to one channel without any
//     paid/organic ambiguity — creator mentions, watch forums, in-person, etc.
//     LEFT NULL for ambiguous platform answers (Meta, TikTok, Google) — the
//     attribution engine fills the gap with UTM context.
//
//   - channelDetail: free-text detail preserved for downstream rollups
//     (specific creator name, specific forum, fitwell-owned vs creator YouTube).

export const PLATFORM_HINTS = [
  "instagram",
  "facebook",
  "tiktok",
  "twitter",
  "threads",
  "youtube",
  "google_search",
  "duckduckgo",
  "bing",
] as const;

export type PlatformHint = (typeof PLATFORM_HINTS)[number];

export const CHANNEL_HINTS = [
  "creator_partnerships",
  "forum_reddit_organic",
  "forum_other",
  "in_person_sighting",
  "ai_search_recommendation",
  "press_editorial",
  "trade_shows",
] as const;

export type ChannelHint = (typeof CHANNEL_HINTS)[number];

type Mapping = {
  platformHint?: PlatformHint;
  channelHint?: ChannelHint;
  channelDetail?: string;
};

// Exact-match lookup of the labels Grapevine sends today.
// Keys must match Grapevine's wire format exactly (verified against the
// 2026-06-05 survey dashboard + 180-day CSV export).
//
// Note: every "Social Media:", "Search Engine:", and "YouTube Video: Fitwell..."
// row is platform-only — we intentionally do NOT set channelHint here, because
// the same platform covers both paid ads and organic posts, and the survey
// can't distinguish. Phase 3 attribution does the merge with UTM data.
const EXACT_MATCHES: Record<string, Mapping> = {
  "Social Media: Instagram": { platformHint: "instagram" },
  "Social Media: Facebook": { platformHint: "facebook" },
  "Social Media: TikTok": { platformHint: "tiktok" },
  "Social Media: X (formerly Twitter)": { platformHint: "twitter", channelDetail: "twitter" },

  "Search Engine: Google": { platformHint: "google_search" },
  "Search Engine: DuckDuckGo": { platformHint: "duckduckgo" },

  "Watch Forum: WatchUSeek": { channelHint: "forum_reddit_organic", channelDetail: "watchuseek" },
  "Watch Forum: Reddit": { channelHint: "forum_reddit_organic", channelDetail: "reddit" },
  "Watch Forum: Korea Watch Community (와치홀릭)": { channelHint: "forum_other", channelDetail: "korea_watch_community" },

  // Fitwell's own YouTube channel — still platform-only because Fitwell can
  // (and does) run YouTube ads from the same channel. Phase 3 disambiguates.
  "YouTube Video: Fitwell YouTube Video": { platformHint: "youtube", channelDetail: "fitwell_owned" },

  "A Friend or Family Member": { channelHint: "in_person_sighting" },
};

// Grapevine prefix-based categories. Free-text "Other" responses under a
// category come through as "Parent: <typed text>" — indistinguishable from
// a configured sub-option in the wire format.
const CATEGORY_PREFIXES: { prefix: string; mapping: Mapping }[] = [
  // YouTube creators — committed to creator_partnerships *and* platform youtube.
  // Both paid and unpaid creator mentions are bucketed together: the survey
  // confirms the introducer was a creator, regardless of commercial relationship.
  { prefix: "YouTube Video: ", mapping: { platformHint: "youtube", channelHint: "creator_partnerships" } },
  { prefix: "Watch Forum: ", mapping: { channelHint: "forum_other" } },
  // Search engines — platform-only. Google could be paid branded, organic
  // branded, paid category, or organic category. UTM resolves.
  { prefix: "Search Engine: ", mapping: { platformHint: undefined } },
  // Social media catch-all — platform-only when the sub-platform isn't in
  // PLATFORM_HINTS exactly. Detail field carries the name.
  { prefix: "Social Media: ", mapping: { platformHint: undefined } },
  // AI tools, blogs, watch events — committed channels (no paid/organic
  // ambiguity at this volume; promote to platform-aware if that changes).
  { prefix: "AI - ChatGPT, Claude, Etc.: ", mapping: { channelHint: "ai_search_recommendation" } },
  { prefix: "Blog or Article: ", mapping: { channelHint: "press_editorial" } },
  { prefix: "Met Us at a Watch Event: ", mapping: { channelHint: "trade_shows" } },
];

const OTHER_SUFFIX = " (* other)";

export function parseOtherSuffix(rawAnswer: string | null | undefined): {
  isOther: boolean;
  cleanedAnswer: string | null;
} {
  if (!rawAnswer) return { isOther: false, cleanedAnswer: null };
  const trimmed = rawAnswer.trim();
  if (!trimmed) return { isOther: false, cleanedAnswer: null };

  if (trimmed.endsWith(OTHER_SUFFIX)) {
    const cleaned = trimmed.slice(0, -OTHER_SUFFIX.length).trim();
    return { isOther: true, cleanedAnswer: cleaned || trimmed };
  }
  return { isOther: false, cleanedAnswer: trimmed };
}

export function mapAnswerToChannel(rawAnswer: string | null | undefined): Mapping | null {
  if (!rawAnswer) return null;

  const trimmed = rawAnswer.trim();
  if (!trimmed) return null;

  const exact = EXACT_MATCHES[trimmed];
  if (exact) return exact;

  for (const { prefix, mapping } of CATEGORY_PREFIXES) {
    if (!trimmed.startsWith(prefix)) continue;
    const detail = trimmed.slice(prefix.length).trim();
    if (!detail) continue;
    const normalize = needsCreatorNormalization(prefix) ? normalizeCreatorName : normalizeOther;
    const normalizedDetail = normalize(detail);
    return {
      ...mapping,
      ...inferPlatformFromPrefix(prefix, detail),
      channelDetail: normalizedDetail,
    };
  }

  return null;
}

// For "Social Media: <unknown>" and "Search Engine: <unknown>", infer the
// platform from the detail when it matches a known PLATFORM_HINTS value.
// Falls back to undefined (no platform claim) when we genuinely don't know.
function inferPlatformFromPrefix(prefix: string, detail: string): { platformHint?: PlatformHint } {
  if (prefix === "Social Media: ") {
    const slug = detail.trim().toLowerCase();
    if (slug === "threads") return { platformHint: "threads" };
    // Other social platforms typed under "Other": leave platform undefined,
    // let the operator promote them to PLATFORM_HINTS if volume justifies it.
    return {};
  }
  if (prefix === "Search Engine: ") {
    const slug = detail.trim().toLowerCase();
    if (slug === "bing") return { platformHint: "bing" };
    return {};
  }
  return {};
}

function needsCreatorNormalization(prefix: string): boolean {
  return prefix === "YouTube Video: " || prefix === "Met Us at a Watch Event: ";
}

// "WatchChris" and "Watch Chris" are the same creator typed two ways in
// Grapevine. Collapse whitespace so they resolve to one channelDetail value
// and stay groupable in downstream queries.
function normalizeCreatorName(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

function normalizeOther(name: string): string {
  return name.trim().toLowerCase();
}
