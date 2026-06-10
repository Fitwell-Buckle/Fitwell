/**
 * Dedup: a story is "new" if its normalized URL hasn't been seen and no
 * recently-seen article has a near-identical title (different outlets
 * syndicating the same press release, or feeds re-emitting items with
 * cache-buster query params).
 *
 * Pure functions — DB reads happen in main.ts and results are passed in.
 */
import { createHash } from "node:crypto";
import type { RawStory } from "./types";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
]);

/** Canonical form used as the cross-run dedup key (newsletter_article.url). */
export function normalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw.trim();
  }
  url.hash = "";
  for (const param of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(param.toLowerCase())) url.searchParams.delete(param);
  }
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  let s = url.toString();
  if (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

/** Stable content hash for a story (title + normalized URL). */
export function contentHash(story: Pick<RawStory, "title" | "url">): string {
  return createHash("sha256")
    .update(`${story.title.trim().toLowerCase()}\n${normalizeUrl(story.url)}`)
    .digest("hex");
}

function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

/** Jaccard similarity over title tokens — 1.0 means identical token sets. */
export function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  return intersection / (ta.size + tb.size - intersection);
}

const TITLE_DUP_THRESHOLD = 0.75;

export interface SeenArticle {
  url: string;
  contentHash: string;
  title: string;
}

export interface DedupResult {
  fresh: RawStory[];
  /** Dropped as duplicates, with the reason for the audit trail. */
  duplicates: Array<{ story: RawStory; reason: string }>;
}

/**
 * Filters stories against (a) already-stored articles and (b) the other
 * stories in this batch. First occurrence in the batch wins.
 */
export function filterNew(stories: RawStory[], seen: SeenArticle[]): DedupResult {
  const seenUrls = new Set(seen.map((s) => normalizeUrl(s.url)));
  const seenHashes = new Set(seen.map((s) => s.contentHash));
  const seenTitles = seen.map((s) => s.title);

  const fresh: RawStory[] = [];
  const duplicates: DedupResult["duplicates"] = [];

  for (const story of stories) {
    const url = normalizeUrl(story.url);
    if (seenUrls.has(url)) {
      duplicates.push({ story, reason: "url already seen" });
      continue;
    }
    if (seenHashes.has(contentHash(story))) {
      duplicates.push({ story, reason: "content hash already seen" });
      continue;
    }
    const nearTitle = seenTitles.find(
      (t) => titleSimilarity(t, story.title) >= TITLE_DUP_THRESHOLD,
    );
    if (nearTitle) {
      duplicates.push({ story, reason: `title near-duplicate of "${nearTitle}"` });
      continue;
    }
    fresh.push(story);
    seenUrls.add(url);
    seenHashes.add(contentHash(story));
    seenTitles.push(story.title);
  }

  return { fresh, duplicates };
}
