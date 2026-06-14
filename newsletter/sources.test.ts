import { describe, expect, it } from "vitest";
import { SOURCES, activeRssSources, activeSources } from "./sources";

describe("source registry", () => {
  it("has unique slugs", () => {
    const slugs = SOURCES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every source has a feed or a scrape url", () => {
    for (const s of SOURCES) {
      expect(s.feedUrl ?? s.scrapeUrl, s.slug).toBeTruthy();
    }
  });

  it("rss / rss-proxied sources carry an https feed url", () => {
    for (const s of SOURCES.filter(
      (x) => x.fetchMode === "rss" || x.fetchMode === "rss-proxied",
    )) {
      expect(s.feedUrl, s.slug).toMatch(/^https:\/\//);
    }
  });

  it("scrape sources carry an https scrape url", () => {
    for (const s of SOURCES.filter((x) => x.fetchMode === "scrape-watchpro")) {
      expect(s.scrapeUrl, s.slug).toMatch(/^https:\/\//);
    }
  });

  it("playwright-mode sources are inactive until that phase is built", () => {
    for (const s of SOURCES.filter((x) => x.fetchMode === "playwright")) {
      expect(s.isActive, s.slug).toBe(false);
    }
  });

  it("activeRssSources is the direct-RSS subset of activeSources", () => {
    expect(activeRssSources().every((s) => s.fetchMode === "rss")).toBe(true);
    const activeSlugs = new Set(activeSources().map((s) => s.slug));
    expect(activeRssSources().every((s) => activeSlugs.has(s.slug))).toBe(true);
  });

  it("WatchPro is an active scrape source; Europa Star is gone", () => {
    const wp = SOURCES.find((s) => s.slug === "watchpro")!;
    expect(wp.isActive).toBe(true);
    expect(wp.fetchMode).toBe("scrape-watchpro");
    expect(wp.scrapeUrl).toMatch(/^https:\/\//);
    expect(SOURCES.find((s) => s.slug === "europastar")).toBeUndefined();
  });

  it("WatchTime is proxied but INACTIVE (BrightData refuses its feed per robots.txt)", () => {
    const wt = SOURCES.find((s) => s.slug === "watchtime")!;
    // Deactivated 2026-06-14: the unlocker 400s /feed/atom "in accordance
    // with robots.txt"; re-activate once the BrightData zone allows it or we
    // scrape the listing instead. See newsletter-engine.md.
    expect(wt.isActive).toBe(false);
    expect(wt.fetchMode).toBe("rss-proxied");
    // the real feed is /feed/atom — /feed/ and /feed/rss both fail
    expect(wt.feedUrl).toBe("https://www.watchtime.com/feed/atom");
  });
});
