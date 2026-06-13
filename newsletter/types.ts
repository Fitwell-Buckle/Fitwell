/**
 * Shared shapes for the newsletter engine. Segment × Type taxonomy is
 * defined in specs/strategy/newsletter.md → Classification axis.
 */

export const SEGMENTS = ["luxury", "mid", "microbrand", "vintage-auction"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const STORY_TYPES = [
  "release",
  "business",
  "auction",
  "community",
  "review",
  "podcast",
] as const;
export type StoryType = (typeof STORY_TYPES)[number];

export const SEGMENT_LABELS: Record<Segment, string> = {
  luxury: "Luxury & Swiss Majors",
  mid: "Mid-Tier",
  microbrand: "Microbrand & Indie",
  "vintage-auction": "Vintage & Auction",
};

export const TYPE_LABELS: Record<StoryType, string> = {
  business: "Business & Industry",
  auction: "Auction & Market",
  community: "Community & Culture",
  release: "New Releases",
  review: "Reviews",
  podcast: "Podcasts",
};

/**
 * The "hard news" group: subject to the maxStories cap, lead-eligible,
 * rendered first as full cards. Business & market ANALYSIS rides with
 * Business (not Community). Community & Culture is profiles / culture /
 * collector human-interest. Releases, Reviews and Podcasts are NOT in
 * this group — each is uncapped and rendered in its own section after the
 * news (see generate.ts for the full render order).
 */
export const NEWS_SECTION_ORDER = ["business", "auction", "community"] as const;

/** A story as it comes off a feed, before dedup/triage. */
export interface RawStory {
  sourceSlug: string;
  sourceName: string;
  url: string;
  title: string;
  /** Plain-text excerpt or content snippet from the feed (may be empty). */
  excerpt: string;
  publishedAt: Date | null;
  imageUrl: string | null;
  /**
   * Full article text, fetched at enrichment (post-triage). Summaries
   * must ground in this — when null, the summarizer falls back to the
   * excerpt and is told not to invent specifics.
   */
  articleText?: string | null;
}

/** A story that survived dedup and triage, ready for the brief. */
export interface BriefStory extends RawStory {
  segment: Segment;
  type: StoryType;
  summary: string;
  /** Other outlets that covered the same story (collapsed by triage). */
  alsoCovered?: Array<{ sourceName: string; url: string }>;
}

/** Triage verdict per story (one entry per input story, matched by url). */
export interface TriageVerdict {
  url: string;
  include: boolean;
  /** Required when include=false, e.g. "pure product review, no business angle" */
  droppedReason: string | null;
  /** Required when include=true */
  segment: Segment | null;
  type: StoryType | null;
  /** 1 (lead) … 10; required when include=true. Lead must be hard news. */
  priority: number | null;
  /**
   * When a story is dropped because another outlet's version of the SAME
   * story was kept, this is the kept story's url — drives "Also at" links.
   */
  duplicateOfUrl: string | null;
}
