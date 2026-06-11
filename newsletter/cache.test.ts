import { existsSync, rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { briefCachePath, loadBriefCache, saveBriefCache } from "./cache";
import type { BriefStory } from "./types";

const SLUG = "micro-adjust-test-cache";

function story(overrides: Partial<BriefStory> = {}): BriefStory {
  return {
    sourceSlug: "hodinkee",
    sourceName: "Hodinkee",
    url: "https://hodinkee.com/a",
    title: "Rolex Names New CEO",
    excerpt: "",
    publishedAt: new Date("2026-06-11T08:00:00Z"),
    imageUrl: "https://cdn.example.com/a.jpg",
    segment: "luxury",
    type: "business",
    summary: "Rolex has a new CEO.",
    alsoCovered: [{ sourceName: "SJX", url: "https://sjx.com/a" }],
    ...overrides,
  };
}

afterEach(() => {
  rmSync(briefCachePath(SLUG), { force: true });
});

describe("brief cache round-trip", () => {
  it("saves and reloads a brief, reviving publishedAt to a Date", () => {
    const brief = [story(), story({ url: "https://hodinkee.com/b", publishedAt: null })];
    saveBriefCache(SLUG, new Date("2026-06-11T09:00:00Z"), brief);

    const loaded = loadBriefCache(SLUG);
    expect(loaded).toHaveLength(2);
    expect(loaded[0].title).toBe("Rolex Names New CEO");
    expect(loaded[0].summary).toBe("Rolex has a new CEO.");
    expect(loaded[0].alsoCovered).toEqual([{ sourceName: "SJX", url: "https://sjx.com/a" }]);
    // publishedAt survives as a real Date (not an ISO string)
    expect(loaded[0].publishedAt).toBeInstanceOf(Date);
    expect(loaded[0].publishedAt?.toISOString()).toBe("2026-06-11T08:00:00.000Z");
    // null publishedAt stays null
    expect(loaded[1].publishedAt).toBeNull();
  });

  it("throws a helpful error when no cache exists", () => {
    expect(existsSync(briefCachePath(SLUG))).toBe(false);
    expect(() => loadBriefCache(SLUG)).toThrow(/No cached brief/);
  });
});
