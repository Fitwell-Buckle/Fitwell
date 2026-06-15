/**
 * Source registry — the code-side source of truth, synced to the
 * newsletter_source table by seedSources() (idempotent upsert on slug).
 *
 * Each source declares a fetchMode (see FetchMode). RSS sources fetch
 * directly; WatchPro is Cloudflare-walled with a stale feed, so it's
 * scraped from its live /news/ listing through the BrightData proxy.
 * Auction houses and IR pages are registered inactive for the future
 * "playwright" headless-scrape phase. Full rationale:
 * specs/strategy/newsletter.md → Source list.
 */

export type SourceCategory =
  | "editorial"
  | "b2b"
  | "community"
  | "auction"
  | "ir"
  | "microbrand";

/**
 * How the engine ingests a source:
 *  - "rss"             plain RSS/Atom fetch (most sources)
 *  - "rss-proxied"     RSS feed exists but the host Cloudflare-blocks
 *                      datacenter IPs → fetch the feed via BrightData
 *  - "scrape-watchpro" no usable feed; parse the /news/ listing HTML
 *                      through BrightData (Cloudflare-walled)
 *  - "playwright"      reserved for the future headless-scrape phase
 */
export type FetchMode =
  | "rss"
  | "rss-proxied"
  | "scrape-watchpro"
  | "playwright";

export interface SourceDef {
  slug: string;
  name: string;
  category: SourceCategory;
  feedUrl: string | null;
  scrapeUrl: string | null;
  fetchMode: FetchMode;
  isActive: boolean;
}

export const SOURCES: SourceDef[] = [
  // ── Editorial (RSS, phase 1) ──────────────────────────────────────
  {
    slug: "hodinkee",
    name: "Hodinkee",
    category: "editorial",
    feedUrl: "https://www.hodinkee.com/articles/rss",
    scrapeUrl: "https://www.hodinkee.com/articles",
    fetchMode: "rss",
    isActive: true,
  },
  {
    slug: "ablogtowatch",
    name: "aBlogtoWatch",
    category: "editorial",
    feedUrl: "https://www.ablogtowatch.com/feed/",
    scrapeUrl: "https://www.ablogtowatch.com/",
    fetchMode: "rss",
    isActive: true,
  },
  {
    slug: "wornandwound",
    name: "Worn & Wound",
    category: "editorial",
    feedUrl: "https://wornandwound.com/feed/",
    scrapeUrl: "https://wornandwound.com/",
    fetchMode: "rss",
    isActive: true,
  },
  {
    slug: "fratello",
    name: "Fratello",
    category: "editorial",
    feedUrl: "https://www.fratellowatches.com/feed/",
    scrapeUrl: "https://www.fratellowatches.com/",
    fetchMode: "rss",
    isActive: true,
  },
  {
    slug: "monochrome",
    name: "Monochrome Watches",
    category: "editorial",
    feedUrl: "https://monochrome-watches.com/feed/",
    scrapeUrl: "https://monochrome-watches.com/",
    fetchMode: "rss",
    isActive: true,
  },
  {
    slug: "timeandtide",
    name: "Time + Tide",
    category: "editorial",
    feedUrl: "https://timeandtidewatches.com/feed/",
    scrapeUrl: "https://timeandtidewatches.com/",
    // Began 415-ing GitHub Actions' datacenter IP on 2026-06-14 (200 from a
    // residential IP regardless of headers) → fetch via BrightData. Verified
    // through the proxy: 30 items.
    fetchMode: "rss-proxied",
    isActive: true,
  },
  {
    slug: "quillandpad",
    name: "Quill & Pad",
    category: "editorial",
    feedUrl: "https://quillandpad.com/feed/",
    scrapeUrl: "https://quillandpad.com/",
    fetchMode: "rss",
    isActive: true,
  },
  {
    slug: "sjx",
    name: "SJX Watches",
    category: "editorial",
    feedUrl: "https://watchesbysjx.com/feed",
    scrapeUrl: "https://watchesbysjx.com/",
    fetchMode: "rss",
    isActive: true,
  },
  {
    slug: "revolution",
    name: "Revolution Watch",
    category: "editorial",
    feedUrl: "https://revolutionwatch.com/feed/",
    scrapeUrl: "https://revolutionwatch.com/",
    // Same 415-from-datacenter-IP block as Time + Tide, started 2026-06-14 →
    // BrightData. Verified through the proxy: 6 items.
    fetchMode: "rss-proxied",
    isActive: true,
  },
  {
    slug: "watchonista",
    name: "Watchonista",
    category: "editorial",
    feedUrl: "https://www.watchonista.com/rss.xml",
    scrapeUrl: "https://www.watchonista.com/",
    fetchMode: "rss",
    isActive: true,
  },
  {
    slug: "watchesofespionage",
    name: "Watches of Espionage",
    category: "editorial",
    // Shopify blog — Atom feed is the standard /blogs/<handle>.atom
    feedUrl: "https://www.watchesofespionage.com/blogs/woe-dispatch.atom",
    scrapeUrl: "https://www.watchesofespionage.com/blogs/woe-dispatch",
    fetchMode: "rss",
    isActive: true,
  },

  {
    slug: "watchtime",
    name: "WatchTime",
    category: "editorial",
    // Cloudflare-walled (403s direct from datacenter IPs), fetched through
    // BrightData. The unlocker honors robots.txt, and /feed/atom is
    // robots-disallowed — so 2026-06-14 it 400'd (`bad_endpoint ... in
    // accordance with robots.txt`) and was briefly deactivated. Re-activated
    // 2026-06-15 once BrightData KYC lifted robots.txt enforcement
    // account-wide; verified 5/5 through the proxy (50 items). The real feed
    // is /feed/atom (`/feed/` and `/feed/rss` both fail). The feed carries no
    // images; enrichment resolves them via og:image scrape through the proxy.
    feedUrl: "https://www.watchtime.com/feed/atom",
    scrapeUrl: "https://www.watchtime.com/",
    fetchMode: "rss-proxied",
    isActive: true,
  },

  // ── Industry / B2B ────────────────────────────────────────────────
  {
    slug: "watchpro",
    name: "WatchPro",
    category: "b2b",
    // RSS feed exists but its CDN serves a STALE cached copy (lastBuildDate
    // frozen days behind the live site). The /news/ HTML is current, so we
    // scrape that instead — via BrightData (Cloudflare-walled).
    feedUrl: null,
    scrapeUrl: "https://www.watchpro.com/news/",
    fetchMode: "scrape-watchpro",
    isActive: true,
  },
  // Europa Star removed 2026-06-10 — publishes too infrequently (month-
  // granularity dates, weeks-stale listings) and gates its real content
  // behind a PDF-style mag viewer. Not worth scraping.

  // ── Auction houses (scrape phase — no usable RSS) ────────────────
  {
    slug: "phillips-watches",
    name: "Phillips Watches",
    category: "auction",
    feedUrl: null,
    scrapeUrl: "https://www.phillips.com/auctions/department/watches",
    fetchMode: "playwright",
    isActive: false,
  },
  {
    slug: "christies-watches",
    name: "Christie's Watches",
    category: "auction",
    feedUrl: null,
    scrapeUrl: "https://www.christies.com/en/results",
    fetchMode: "playwright",
    isActive: false,
  },
  {
    slug: "sothebys-watches",
    name: "Sotheby's Watches",
    category: "auction",
    feedUrl: null,
    scrapeUrl: "https://www.sothebys.com/en/departments/watches",
    fetchMode: "playwright",
    isActive: false,
  },

  // ── Earnings / corporate IR (scrape phase) ───────────────────────
  {
    slug: "swatch-group-ir",
    name: "Swatch Group IR",
    category: "ir",
    feedUrl: null,
    scrapeUrl: "https://www.swatchgroup.com/en/investors",
    fetchMode: "playwright",
    isActive: false,
  },
  {
    slug: "richemont-ir",
    name: "Richemont IR",
    category: "ir",
    feedUrl: null,
    scrapeUrl: "https://www.richemont.com/en/home/media/press-releases-and-news/",
    fetchMode: "playwright",
    isActive: false,
  },
];

/** Registry invariant checks live in sources.test.ts. */
export function activeSources(): SourceDef[] {
  return SOURCES.filter((s) => s.isActive);
}

/** Direct-RSS sources only (the bulk; fetched without proxy or scraper). */
export function activeRssSources(): SourceDef[] {
  return SOURCES.filter((s) => s.isActive && s.fetchMode === "rss");
}
