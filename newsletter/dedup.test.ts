import { describe, expect, it } from "vitest";
import { contentHash, filterNew, normalizeUrl, titleSimilarity } from "./dedup";
import type { RawStory } from "./types";

function story(overrides: Partial<RawStory>): RawStory {
  return {
    sourceSlug: "hodinkee",
    sourceName: "Hodinkee",
    url: "https://www.hodinkee.com/articles/rolex-ceo",
    title: "Rolex Names New CEO",
    excerpt: "",
    publishedAt: null,
    imageUrl: null,
    ...overrides,
  };
}

describe("normalizeUrl", () => {
  it("strips tracking params, www, hash, and trailing slash", () => {
    expect(
      normalizeUrl(
        "https://www.hodinkee.com/articles/rolex/?utm_source=rss&utm_medium=feed#top",
      ),
    ).toBe("https://hodinkee.com/articles/rolex");
  });

  it("keeps meaningful query params", () => {
    expect(normalizeUrl("https://example.com/a?page=2&utm_campaign=x")).toBe(
      "https://example.com/a?page=2",
    );
  });

  it("passes through non-URLs untouched", () => {
    expect(normalizeUrl("not a url")).toBe("not a url");
  });
});

describe("contentHash", () => {
  it("is stable across tracking-param and case differences", () => {
    const a = contentHash({ title: "Rolex Names New CEO", url: "https://www.x.com/a" });
    const b = contentHash({ title: "rolex names new ceo", url: "https://x.com/a?utm_source=rss" });
    expect(a).toBe(b);
  });

  it("differs for different titles", () => {
    const a = contentHash({ title: "Rolex Names New CEO", url: "https://x.com/a" });
    const b = contentHash({ title: "Omega Names New CEO", url: "https://x.com/a" });
    expect(a).not.toBe(b);
  });
});

describe("titleSimilarity", () => {
  it("is 1 for identical titles", () => {
    expect(titleSimilarity("Rolex Names New CEO", "Rolex Names New CEO")).toBe(1);
  });

  it("is high for syndicated rewrites", () => {
    expect(
      titleSimilarity(
        "Rolex Names New CEO After Decade",
        "Rolex names new CEO after a decade",
      ),
    ).toBeGreaterThan(0.75);
  });

  it("is low for unrelated titles", () => {
    expect(
      titleSimilarity("Rolex Names New CEO", "Baltic Drops 300-Piece Diver"),
    ).toBeLessThan(0.3);
  });
});

describe("filterNew", () => {
  it("drops stories whose url was already seen", () => {
    const { fresh, duplicates } = filterNew(
      [story({})],
      [
        {
          url: "https://hodinkee.com/articles/rolex-ceo?utm_source=rss",
          contentHash: "x",
          title: "something else",
        },
      ],
    );
    expect(fresh).toHaveLength(0);
    expect(duplicates[0].reason).toBe("url already seen");
  });

  it("drops near-duplicate titles across sources", () => {
    const { fresh, duplicates } = filterNew(
      [
        story({}),
        story({
          sourceSlug: "fratello",
          url: "https://fratellowatches.com/rolex-new-ceo",
          title: "Rolex names new CEO",
        }),
      ],
      [],
    );
    expect(fresh).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].reason).toContain("near-duplicate");
  });

  it("keeps genuinely distinct stories", () => {
    const { fresh } = filterNew(
      [
        story({}),
        story({
          url: "https://wornandwound.com/baltic-diver",
          title: "Baltic Drops 300-Piece Limited Diver",
        }),
      ],
      [],
    );
    expect(fresh).toHaveLength(2);
  });
});
