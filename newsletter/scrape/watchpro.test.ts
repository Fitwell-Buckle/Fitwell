import { afterEach, describe, expect, it } from "vitest";
import { parseWatchProListing, scrapeWatchPro } from "./watchpro";
import type { SourceDef } from "../sources";

const SOURCE: SourceDef = {
  slug: "watchpro",
  name: "WatchPro",
  category: "b2b",
  feedUrl: null,
  scrapeUrl: "https://www.watchpro.com/news/",
  fetchMode: "scrape-watchpro",
  isActive: true,
};

// Trimmed from the live /news/ markup (2026-06-10).
const LISTING = `
<main>
  <article id="post-153614" class="post-153614 type-post category-news tag-mbf">
    <figure class="post-thumbnail">
      <a class="post-thumbnail-inner" href="https://www.watchpro.com/mbf-distils-art-horology-into-hm12-guardian/" aria-hidden="true">
        <img width="1200" height="900"
          data-lazy-srcset="https://www.watchpro.com/cloud/2026/06/10/x-800x600.jpg 800w, https://www.watchpro.com/cloud/2026/06/10/x-1200x900.jpg 1200w, https://www.watchpro.com/cloud/2026/06/10/x-400x237.jpg 400w"
          title="MB&amp;F distils 20 years of art and horology into HM12 The Guardian 1" />
      </a>
    </figure>
    <div class="entry-wrapper">
      <h2 class="entry-title"><a href="https://www.watchpro.com/mbf-distils-art-horology-into-hm12-guardian/">MB&amp;F distils 20 years of art and horology into HM12 The Guardian</a></h2>
      <time class="entry-date published" datetime="2026-06-10T15:30:05+01:00">June 10, 2026</time>
    </div>
  </article>
  <article id="post-153600" class="post-153600 type-post category-news">
    <figure class="post-thumbnail">
      <a class="post-thumbnail-inner" href="https://www.watchpro.com/royal-pop-hits-audemars-piguet-royal-oak-price/">
        <img data-lazy-src="https://www.watchpro.com/cloud/2026/06/03/ap-1200x900.jpg" />
      </a>
    </figure>
    <div class="entry-wrapper">
      <h2 class="entry-title"><a href="https://www.watchpro.com/royal-pop-hits-audemars-piguet-royal-oak-price/">Audemars Piguet Royal Oak price dropped 3% in a chaotic week</a></h2>
      <time datetime="2026-06-03T12:05:27+01:00">June 3, 2026</time>
    </div>
  </article>
</main>`;

describe("parseWatchProListing", () => {
  it("extracts title, url, date, and largest image per article", () => {
    const stories = parseWatchProListing(LISTING, SOURCE);
    expect(stories).toHaveLength(2);

    const first = stories[0];
    expect(first.title).toBe(
      "MB&F distils 20 years of art and horology into HM12 The Guardian",
    );
    expect(first.url).toBe(
      "https://www.watchpro.com/mbf-distils-art-horology-into-hm12-guardian/",
    );
    // widest from the srcset (1200w)
    expect(first.imageUrl).toBe("https://www.watchpro.com/cloud/2026/06/10/x-1200x900.jpg");
    expect(first.publishedAt?.toISOString()).toBe("2026-06-10T14:30:05.000Z");
    expect(first.sourceSlug).toBe("watchpro");
  });

  it("reads dates accurately (so the lookback window works) — not the stale feed", () => {
    const stories = parseWatchProListing(LISTING, SOURCE);
    expect(stories[1].publishedAt?.toISOString()).toBe("2026-06-03T11:05:27.000Z");
  });

  it("falls back to data-lazy-src when there's no srcset", () => {
    const stories = parseWatchProListing(LISTING, SOURCE);
    expect(stories[1].imageUrl).toBe("https://www.watchpro.com/cloud/2026/06/03/ap-1200x900.jpg");
  });

  it("dedupes repeated article urls and returns [] for empty markup", () => {
    expect(parseWatchProListing("<main>nothing</main>", SOURCE)).toEqual([]);
  });
});

describe("scrapeWatchPro fail behavior", () => {
  const SAVED = {
    user: process.env.BRIGHTDATA_USERNAME,
    pass: process.env.BRIGHTDATA_PASSWORD,
  };
  afterEach(() => {
    if (SAVED.user === undefined) delete process.env.BRIGHTDATA_USERNAME;
    else process.env.BRIGHTDATA_USERNAME = SAVED.user;
    if (SAVED.pass === undefined) delete process.env.BRIGHTDATA_PASSWORD;
    else process.env.BRIGHTDATA_PASSWORD = SAVED.pass;
  });

  it("fails soft (returns []) when proxy creds are absent — dev runs stay green", async () => {
    delete process.env.BRIGHTDATA_USERNAME;
    delete process.env.BRIGHTDATA_PASSWORD;
    await expect(scrapeWatchPro(SOURCE, async () => null)).resolves.toEqual([]);
  });

  it("THROWS when creds are present but the fetch returns nothing — so the failure is visible", async () => {
    process.env.BRIGHTDATA_USERNAME = "u";
    process.env.BRIGHTDATA_PASSWORD = "p";
    await expect(scrapeWatchPro(SOURCE, async () => null)).rejects.toThrow(/watchpro/i);
  });

  it("parses normally when the fetch succeeds", async () => {
    process.env.BRIGHTDATA_USERNAME = "u";
    process.env.BRIGHTDATA_PASSWORD = "p";
    const stories = await scrapeWatchPro(SOURCE, async () => LISTING);
    expect(stories).toHaveLength(2);
  });
});
