/**
 * Per-story page enrichment: ONE fetch of the article page yields both
 *   - the story image (feed-provided image → og:image fallback), and
 *   - the article text that grounds the summary (the summarizer is
 *     instructed to use only facts present in it — no invented specs,
 *     prices, or run sizes).
 *
 * Resolved images are re-hosted to Vercel Blob when BLOB_READ_WRITE_TOKEN
 * is set (CDN stability + no hotlinking, per the image-rights note in
 * newsletter-engine.md); until then we hotlink and warn once.
 */
import { createHash } from "node:crypto";
import type { RawStory } from "./types";
import { proxiedFetch } from "./scrape/proxy";
import { SOURCES } from "./sources";
import { decodeEntities } from "./text";

/** Slugs whose article pages are Cloudflare-walled → fetch via proxy. */
const PROXY_SLUGS = new Set(
  SOURCES.filter(
    (s) => s.fetchMode === "rss-proxied" || s.fetchMode === "scrape-watchpro",
  ).map((s) => s.slug),
);

const FETCH_TIMEOUT_MS = 10_000;
// Worn & Wound inlines ~750KB of CSS/JS before the content — the cap must
// comfortably clear a bloated page while bounding the worst case.
const MAX_HTML_BYTES = 1_500_000;
/** Article text cap fed to the summarizer (~3K tokens). */
const MAX_ARTICLE_CHARS = 12_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
// Some WAFs (aBlogtoWatch) 403 a Chrome UA that arrives without the rest
// of a real browser's header fingerprint, but allow a generic UA — try
// both before giving up.
const UA_PROFILES = [UA, "Mozilla/5.0"];

/** Pulls og:image (or twitter:image fallback) out of a page's HTML head. */
export function extractOgImage(html: string): string | null {
  // property/name and content can appear in either order
  const patterns = [
    /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+(?:property|name)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1] && /^https?:\/\//i.test(match[1])) return match[1];
  }
  return null;
}

/**
 * Article body text from page HTML: prefers the <article> element, falls
 * back to all paragraphs. Null when the page yields too little to ground
 * a summary (paywall shells, JS-rendered pages).
 */
export function extractArticleText(html: string): string | null {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const articleMatch = cleaned.match(/<article[\s\S]*?<\/article>/i);
  const scope = articleMatch ? articleMatch[0] : cleaned;
  const paragraphs = [...scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) =>
      decodeEntities(m[1].replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((p) => p.length > 40);
  const text = paragraphs.join("\n\n");
  if (text.length < 200) return null;
  return text.length > MAX_ARTICLE_CHARS
    ? `${text.slice(0, MAX_ARTICLE_CHARS)}…`
    : text;
}

async function fetchWithTimeout(
  url: string,
  accept: string,
  userAgent: string = UA,
): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": userAgent, Accept: accept },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
  });
}

/** Full page HTML (capped), trying each UA profile until one isn't blocked. */
export async function fetchPageHtml(url: string): Promise<string | null> {
  for (const ua of UA_PROFILES) {
    try {
      const res = await fetchWithTimeout(url, "text/html", ua);
      if (!res.ok) {
        res.body?.cancel().catch(() => {});
        continue;
      }
      const reader = res.body?.getReader();
      if (!reader) continue;
      let html = "";
      let bytes = 0;
      const decoder = new TextDecoder();
      while (bytes < MAX_HTML_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        html += decoder.decode(value, { stream: true });
      }
      reader.cancel().catch(() => {});
      return html;
    } catch {
      // timeout / network — try the next profile
    }
  }
  return null;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

let warnedHotlink = false;

/**
 * Re-host an image to Vercel Blob (hash-named, so the same image is never
 * stored twice). Falls back to the original URL when the token is absent
 * or the upload fails.
 */
export async function hostImage(imageUrl: string): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    if (!warnedHotlink) {
      console.warn(
        "BLOB_READ_WRITE_TOKEN not set — hotlinking source images (set the token to re-host on Vercel Blob)",
      );
      warnedHotlink = true;
    }
    return imageUrl;
  }
  try {
    const res = await fetchWithTimeout(imageUrl, "image/*");
    if (!res.ok) return imageUrl;
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    const ext = EXT_BY_MIME[mime];
    if (!ext) return imageUrl;
    const body = await res.arrayBuffer();
    const hash = createHash("sha256").update(Buffer.from(body)).digest("hex").slice(0, 24);
    const { put } = await import("@vercel/blob");
    const blob = await put(`newsletter/${hash}.${ext}`, body, {
      access: "public",
      contentType: mime,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return blob.url;
  } catch (e) {
    console.warn(
      `blob upload failed for ${imageUrl}: ${e instanceof Error ? e.message : e}`,
    );
    return imageUrl;
  }
}

export interface Enrichment {
  imageUrl: string | null;
  articleText: string | null;
}

/** One page fetch → image (feed image wins, og:image fallback) + article text. */
export async function enrichStory(
  story: Pick<RawStory, "url" | "imageUrl" | "sourceSlug">,
): Promise<Enrichment> {
  // Cloudflare-walled sources (WatchPro) need the residential proxy for
  // their article pages too, not just the feed.
  const html = PROXY_SLUGS.has(story.sourceSlug)
    ? ((await proxiedFetch(story.url)) ?? (await fetchPageHtml(story.url)))
    : await fetchPageHtml(story.url);
  const articleText = html ? extractArticleText(html) : null;
  const candidate = story.imageUrl ?? (html ? extractOgImage(html) : null);
  return {
    imageUrl: candidate ? await hostImage(candidate) : null,
    articleText,
  };
}

/** Enrich all stories with bounded concurrency, fail-soft per story. */
export async function enrichStories<
  T extends Pick<RawStory, "url" | "imageUrl" | "sourceSlug">,
>(stories: T[], concurrency = 4): Promise<Array<T & Enrichment>> {
  const out: Array<T & Enrichment> = new Array(stories.length);
  let next = 0;
  async function worker() {
    while (next < stories.length) {
      const i = next++;
      try {
        out[i] = { ...stories[i], ...(await enrichStory(stories[i])) };
      } catch (e) {
        console.warn(
          `enrichment failed for ${stories[i].url}: ${e instanceof Error ? e.message : e}`,
        );
        out[i] = { ...stories[i], imageUrl: stories[i].imageUrl, articleText: null };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, stories.length) }, worker),
  );
  return out;
}
