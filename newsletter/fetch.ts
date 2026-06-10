/**
 * RSS/Atom fetching for the phase-1 source set. One source failing must
 * never kill the run — failures are collected and reported, and the
 * brief ships from whatever succeeded.
 */
import Parser from "rss-parser";
import { NEWSLETTER } from "./config";
import type { SourceDef } from "./sources";
import type { RawStory } from "./types";
import { isProxyConfigured, proxiedFetch } from "./scrape/proxy";
import { scrapeWatchPro } from "./scrape/watchpro";
import { decodeEntities } from "./text";

const FETCH_TIMEOUT_MS = 20_000;

const parser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  headers: {
    // A few WP feeds 403 the default node UA
    "User-Agent": "FitwellNewsletterBot/1.0 (+https://fitwellbuckle.co)",
  },
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail"],
    ],
  },
});

/** Strips tags and collapses whitespace from feed HTML snippets. */
export function toExcerpt(html: string | undefined, maxLen = 600): string {
  if (!html) return "";
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

interface MediaTag {
  $?: { url?: string };
}

interface FeedItemShape {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
  enclosure?: { url?: string };
  mediaContent?: MediaTag[];
  mediaThumbnail?: MediaTag;
}

/** Best feed-provided image: enclosure → media:content → media:thumbnail. */
export function feedImage(item: FeedItemShape): string | null {
  const candidates = [
    item.enclosure?.url,
    ...(item.mediaContent ?? []).map((m) => m.$?.url),
    item.mediaThumbnail?.$?.url,
  ];
  return candidates.find((u) => u && /^https?:\/\//i.test(u)) ?? null;
}

export function itemToStory(
  item: FeedItemShape,
  source: SourceDef,
): RawStory | null {
  if (!item.link || !item.title) return null;
  const publishedAt = item.isoDate
    ? new Date(item.isoDate)
    : item.pubDate
      ? new Date(item.pubDate)
      : null;
  return {
    sourceSlug: source.slug,
    sourceName: source.name,
    url: item.link,
    title: decodeEntities(item.title.trim()),
    excerpt: item.contentSnippet?.trim() || toExcerpt(item.content),
    publishedAt: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt : null,
    imageUrl: feedImage(item),
  };
}

/** True if the story falls inside the lookback window (undated items pass). */
export function withinLookback(story: RawStory, now: Date): boolean {
  if (!story.publishedAt) return true;
  const ageMs = now.getTime() - story.publishedAt.getTime();
  return ageMs <= NEWSLETTER.lookbackHours * 60 * 60 * 1000;
}

export interface FetchResult {
  stories: RawStory[];
  failures: Array<{ slug: string; error: string }>;
}

/** Parse already-fetched feed XML (used by the proxied path). */
export async function parseFeedXml(
  xml: string,
  source: SourceDef,
  now: Date,
): Promise<RawStory[]> {
  const feed = await parser.parseString(xml);
  return (feed.items ?? [])
    .map((item) => itemToStory(item, source))
    .filter((s): s is RawStory => s !== null)
    .filter((s) => withinLookback(s, now));
}

/**
 * Pull + parse one source by fetchMode, WITHOUT the freshness filter
 * (applied uniformly by the caller so no path can skip it). Throws on
 * failure.
 */
async function fetchOneSourceRaw(source: SourceDef, now: Date): Promise<RawStory[]> {
  switch (source.fetchMode) {
    case "rss": {
      const feed = await parser.parseURL(source.feedUrl!);
      return (feed.items ?? [])
        .map((item) => itemToStory(item, source))
        .filter((s): s is RawStory => s !== null);
    }
    case "rss-proxied": {
      // Use proxiedFetch's broad default Accept — it covers both RSS and
      // Atom; a narrow rss-only Accept makes Atom feeds (WatchTime) 406.
      const xml = await proxiedFetch(source.feedUrl!);
      if (!xml) {
        throw new Error(
          isProxyConfigured()
            ? "proxied feed fetch returned nothing"
            : "BrightData proxy not configured (BRIGHTDATA_USERNAME/PASSWORD)",
        );
      }
      // parseFeedXml applies lookback itself; harmless to re-filter below.
      return parseFeedXml(xml, source, now);
    }
    case "scrape-watchpro":
      return scrapeWatchPro(source);
    case "playwright":
      throw new Error(`source ${source.slug} requires the unbuilt playwright phase`);
  }
}

/**
 * One source's stories within the lookback window. The scraped source
 * (WatchPro) carries real publish dates straight from the listing, so
 * the SAME freshness rule that gates RSS gates it too — otherwise a
 * listing page's week-deep backlog leaks into the brief. Undated items
 * (if any) pass, per withinLookback.
 */
async function fetchOneSource(source: SourceDef, now: Date): Promise<RawStory[]> {
  const stories = await fetchOneSourceRaw(source, now);
  return stories.filter((s) => withinLookback(s, now));
}

/** Fetch every active source, dispatching by fetchMode. Per-source fail-soft. */
export async function fetchAllSources(
  sources: SourceDef[],
  now: Date = new Date(),
): Promise<FetchResult> {
  const results = await Promise.allSettled(
    sources.map((source) => fetchOneSource(source, now)),
  );

  const stories: RawStory[] = [];
  const failures: FetchResult["failures"] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      stories.push(...result.value);
    } else {
      failures.push({
        slug: sources[i].slug,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
    }
  });

  // Newest first so the lead story falls out naturally
  stories.sort(
    (a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
  );
  return { stories, failures };
}

/** @deprecated direct-RSS-only path; use fetchAllSources. Kept for tests. */
export async function fetchAllFeeds(
  sources: SourceDef[],
  now: Date = new Date(),
): Promise<FetchResult> {
  return fetchAllSources(sources, now);
}
