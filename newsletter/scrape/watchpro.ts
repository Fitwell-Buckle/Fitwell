/**
 * WatchPro listing scraper. WatchPro has an RSS feed, but its CDN serves
 * a STALE cached copy (lastBuildDate frozen days behind the live site —
 * a WordPress full-page-cache bug). The /news/ HTML, by contrast, is
 * current. So we scrape the listing instead of trusting the feed.
 *
 * WatchPro is Cloudflare-walled, so the fetch goes through the BrightData
 * proxy (proxiedFetch). Returns [] when the proxy isn't configured rather
 * than throwing — the rest of the brief still ships.
 */
import type { SourceDef } from "../sources";
import type { RawStory } from "../types";
import { decodeEntities } from "../text";
import { isProxyConfigured, proxiedFetch } from "./proxy";

const LISTING_URL = "https://www.watchpro.com/news/";

/** Largest image from a WordPress data-lazy-srcset, or the lazy-src fallback. */
function pickImage(block: string): string | null {
  const srcset = block.match(/data-lazy-srcset="([^"]+)"/i)?.[1];
  if (srcset) {
    // entries are "url 800w, url 1200w, …" — take the widest
    const widest = srcset
      .split(",")
      .map((part) => {
        const [url, w] = part.trim().split(/\s+/);
        return { url, w: parseInt(w ?? "0", 10) || 0 };
      })
      .sort((a, b) => b.w - a.w)[0];
    if (widest?.url?.startsWith("http")) return widest.url;
  }
  const lazy = block.match(/data-lazy-src="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i)?.[1];
  return lazy ?? null;
}

/** Publish date from the <time> tag, falling back to the /cloud/YYYY/MM/DD/ image path. */
function extractDate(block: string): Date | null {
  const dt = block.match(/datetime="([^"]+)"/i)?.[1];
  if (dt) {
    const d = new Date(dt);
    if (!isNaN(d.getTime())) return d;
  }
  const path = block.match(/\/cloud\/(\d{4})\/(\d{2})\/(\d{2})\//);
  if (path) {
    const d = new Date(`${path[1]}-${path[2]}-${path[3]}T12:00:00Z`);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

export function parseWatchProListing(html: string, source: SourceDef): RawStory[] {
  const blocks = html.split(/<article\b/i).slice(1);
  const stories: RawStory[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const url = block.match(
      /href="(https:\/\/www\.watchpro\.com\/[a-z0-9][a-z0-9-]+\/)"/i,
    )?.[1];
    // Title: the h2/h3 anchor text is cleaner than the image title attr
    const title =
      block.match(/<h[23][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1]?.replace(/<[^>]+>/g, "") ??
      null;
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    stories.push({
      sourceSlug: source.slug,
      sourceName: source.name,
      url,
      title: decodeEntities(title).replace(/\s+/g, " ").trim(),
      excerpt: "",
      publishedAt: extractDate(block),
      imageUrl: pickImage(block),
    });
  }
  return stories;
}

/**
 * Scrape the WatchPro listing through the proxy.
 *
 * Fail behavior is deliberately split so a scheduled run is never blind:
 * - proxy creds ABSENT (typical local dev) → return [] quietly; we don't
 *   want a dev run to go red just because BrightData isn't wired locally.
 * - proxy creds PRESENT but the fetch came back empty (CI/prod) → THROW,
 *   so `fetchAllSources` records it as a `source failed: watchpro` line.
 *   The old silent `return []` made a proxy/Cloudflare failure look
 *   identical to "fetched fine, nothing new" — invisible in the logs.
 *
 * `fetcher` is injectable purely as a test seam; production passes the
 * real proxiedFetch.
 */
export async function scrapeWatchPro(
  source: SourceDef,
  fetcher: (url: string, accept?: string) => Promise<string | null> = proxiedFetch,
): Promise<RawStory[]> {
  const html = await fetcher(LISTING_URL, "text/html");
  if (!html) {
    if (!isProxyConfigured()) return [];
    throw new Error("watchpro listing fetch returned nothing (proxy/Cloudflare)");
  }
  return parseWatchProListing(html, source);
}
