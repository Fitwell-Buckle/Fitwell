import { describe, expect, it } from "vitest";
import { feedImage, itemToStory, toExcerpt, withinLookback } from "./fetch";
import { NEWSLETTER } from "./config";
import type { RawStory } from "./types";
import type { SourceDef } from "./sources";

const SOURCE: SourceDef = {
  slug: "watchpro",
  name: "WatchPro",
  category: "b2b",
  feedUrl: null,
  scrapeUrl: "https://www.watchpro.com/news/",
  fetchMode: "scrape-watchpro",
  isActive: true,
};

const NOW = new Date("2026-06-10T09:00:00Z");

function story(publishedAt: Date | null): RawStory {
  return {
    sourceSlug: "watchpro",
    sourceName: "WatchPro",
    url: "https://www.watchpro.com/x/",
    title: "x",
    excerpt: "",
    publishedAt,
    imageUrl: null,
  };
}

describe("withinLookback", () => {
  it(`keeps stories inside the ${NEWSLETTER.lookbackHours}h window`, () => {
    const recent = new Date(NOW.getTime() - 10 * 60 * 60 * 1000); // 10h ago
    expect(withinLookback(story(recent), NOW)).toBe(true);
  });

  it("excludes stories older than the window (the stale-WatchPro regression)", () => {
    // June 3 vs a June 10 run — ~7 days old, must NOT appear in the brief
    const old = new Date("2026-06-03T11:20:00Z");
    expect(withinLookback(story(old), NOW)).toBe(false);
  });

  it("passes undated stories (no per-item date available)", () => {
    expect(withinLookback(story(null), NOW)).toBe(true);
  });

  it("sits right at the boundary correctly", () => {
    const justInside = new Date(NOW.getTime() - 35 * 60 * 60 * 1000);
    const justOutside = new Date(NOW.getTime() - 37 * 60 * 60 * 1000);
    expect(withinLookback(story(justInside), NOW)).toBe(true);
    expect(withinLookback(story(justOutside), NOW)).toBe(false);
  });
});

describe("itemToStory", () => {
  it("maps a feed item and decodes entities in the title", () => {
    const s = itemToStory(
      {
        title: "Rolex &amp; Tudor&#8217;s big week",
        link: "https://x.com/a",
        isoDate: "2026-06-10T08:00:00Z",
        contentSnippet: "snippet",
      },
      SOURCE,
    );
    expect(s?.title).toBe("Rolex & Tudor’s big week");
    expect(s?.sourceSlug).toBe("watchpro");
  });

  it("returns null without a link or title", () => {
    expect(itemToStory({ title: "no link" }, SOURCE)).toBeNull();
    expect(itemToStory({ link: "https://x.com" }, SOURCE)).toBeNull();
  });
});

describe("feedImage", () => {
  it("prefers enclosure, then media:content, then media:thumbnail", () => {
    expect(feedImage({ enclosure: { url: "https://x/a.jpg" } })).toBe("https://x/a.jpg");
    expect(
      feedImage({ mediaContent: [{ $: { url: "https://x/b.jpg" } }] }),
    ).toBe("https://x/b.jpg");
    expect(feedImage({ mediaThumbnail: { $: { url: "https://x/c.jpg" } } })).toBe(
      "https://x/c.jpg",
    );
    expect(feedImage({})).toBeNull();
  });
});

describe("toExcerpt", () => {
  it("strips tags and truncates", () => {
    expect(toExcerpt("<p>Hello <b>world</b></p>")).toBe("Hello world");
    expect(toExcerpt("x".repeat(700)).endsWith("…")).toBe(true);
    expect(toExcerpt(undefined)).toBe("");
  });
});
