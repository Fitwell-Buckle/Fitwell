// Commits a single canonical attribution claim for one order, given the
// survey response and UTM context that we have for it.
//
// The data reality on prod (2026-06-05):
//   - 24% of orders have a Grapevine survey response
//   - Only ~5% of orders have UTM linkage on `order.link_method`
//     (see specs/work-plans/todo/utm-linking-gap.md)
// So this function is survey-first: when the survey commits to a channel
// (creator/forum/in-person/etc), use it; when it only reveals a platform,
// keep it platform-level rather than guessing paid vs organic; only fall
// back to UTM when survey is missing entirely.
//
// Once the UTM linking gap is fixed, this function should grow the
// (platform_hint + utm) → committed channel refinement (Phase 3 follow-up).

import type { ChannelHint, PlatformHint } from "./channel-mapping";

export type AttributionSource =
  | "survey_committed" // survey.channel_hint resolved to a funnel.md channel
  | "survey_platform" // survey.platform_hint only — paid/organic unknown
  | "utm_only" // no survey; UTM gave us something
  | "none"; // no signal anywhere

export type CommittedAttribution = {
  /** The funnel.md channel ID when we can commit; else null. */
  channel: ChannelHint | null;
  /** The platform when survey gave a platform but not a channel. */
  platform: PlatformHint | null;
  /** Specific creator/forum identifier (e.g. 'watchchris', 'reddit'). */
  detail: string | null;
  /** UTM-derived bucket when neither survey channel nor platform applies. */
  utmBucket: UtmBucket | null;
  source: AttributionSource;
};

export type UtmBucket =
  | "google_paid"
  | "google_organic"
  | "meta_paid"
  | "tiktok_paid"
  | "email"
  | "direct"
  | "referral_other";

export type SurveyInput = {
  platformHint: PlatformHint | null;
  channelHint: ChannelHint | null;
  channelDetail: string | null;
} | null;

export type UtmInput = {
  source: string | null;
  medium: string | null;
} | null;

export function commitAttribution(
  survey: SurveyInput,
  utm: UtmInput,
): CommittedAttribution {
  // 1. Survey committed a channel (creator/forum/in-person/AI/press/event)
  if (survey?.channelHint) {
    return {
      channel: survey.channelHint,
      platform: survey.platformHint ?? null,
      detail: survey.channelDetail ?? null,
      utmBucket: null,
      source: "survey_committed",
    };
  }

  // 2. Survey revealed a platform but can't commit paid vs organic
  if (survey?.platformHint) {
    return {
      channel: null,
      platform: survey.platformHint,
      detail: survey.channelDetail ?? null,
      utmBucket: null,
      source: "survey_platform",
    };
  }

  // 3. No survey signal — fall back to UTM bucket
  const bucket = mapUtmToBucket(utm);
  return {
    channel: null,
    platform: null,
    detail: null,
    utmBucket: bucket,
    source: bucket ? "utm_only" : "none",
  };
}

function mapUtmToBucket(utm: UtmInput): UtmBucket | null {
  if (!utm?.source) return null;
  const src = utm.source.toLowerCase();
  const med = (utm.medium ?? "").toLowerCase();

  if (src === "google") {
    if (med === "cpc" || med === "paid") return "google_paid";
    return "google_organic";
  }
  if (src === "facebook" || src === "meta" || src === "instagram" || src === "ig") {
    return "meta_paid"; // most Meta UTM rows we see are paid; survey supplements organic
  }
  if (src === "tiktok") return "tiktok_paid";
  if (med === "email" || src === "klaviyo" || src === "judgeme") return "email";
  if (med === "referral") return "referral_other";
  return "referral_other";
}

/**
 * Group key used by the attribution view to roll up rows. Always a stable
 * string so downstream queries can `GROUP BY` it. Preserves the source so
 * the view can show whether attribution was committed or platform-only.
 */
export function groupKey(c: CommittedAttribution): string {
  if (c.channel) return `channel:${c.channel}`;
  if (c.platform) return `platform:${c.platform}`;
  if (c.utmBucket) return `utm:${c.utmBucket}`;
  return "unattributed";
}

/**
 * Human-readable label for a CommittedAttribution group. Used in the
 * admin view headers and CSV exports.
 */
export function groupLabel(c: CommittedAttribution): string {
  if (c.channel) {
    return CHANNEL_LABELS[c.channel];
  }
  if (c.platform) {
    return `${PLATFORM_LABELS[c.platform]} (paid/organic mix)`;
  }
  if (c.utmBucket) {
    return UTM_BUCKET_LABELS[c.utmBucket];
  }
  return "No survey or UTM";
}

const CHANNEL_LABELS: Record<ChannelHint, string> = {
  creator_partnerships: "Creator partnerships",
  forum_reddit_organic: "Watch forums (Reddit / WatchUSeek)",
  forum_other: "Other watch forums",
  in_person_sighting: "Friend / in-person",
  ai_search_recommendation: "AI tools (ChatGPT / Claude)",
  press_editorial: "Press / editorial",
  trade_shows: "Trade shows",
};

const PLATFORM_LABELS: Record<PlatformHint, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  twitter: "X / Twitter",
  threads: "Threads",
  youtube: "YouTube",
  google_search: "Google search",
  duckduckgo: "DuckDuckGo",
  bing: "Bing",
};

const UTM_BUCKET_LABELS: Record<UtmBucket, string> = {
  google_paid: "Google Ads (paid)",
  google_organic: "Google search (organic)",
  meta_paid: "Meta Ads (paid)",
  tiktok_paid: "TikTok Ads (paid)",
  email: "Email",
  direct: "Direct",
  referral_other: "Referral / other",
};
