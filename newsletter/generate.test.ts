import { describe, expect, it } from "vitest";
import { buildSubject, campaignSlug } from "./config";
import { buildMjml, layoutBrief } from "./generate";
import type { BriefStory } from "./types";

function brief(overrides: Partial<BriefStory>): BriefStory {
  return {
    sourceSlug: "hodinkee",
    sourceName: "Hodinkee",
    url: "https://hodinkee.com/articles/rolex-ceo",
    title: "Rolex Names New CEO",
    excerpt: "",
    publishedAt: null,
    imageUrl: null,
    segment: "luxury",
    type: "business",
    summary: "Rolex has a new CEO. It matters.",
    ...overrides,
  };
}

describe("campaignSlug / buildSubject", () => {
  it("builds a date-stamped slug", () => {
    expect(campaignSlug(new Date("2026-06-10T09:00:00Z"))).toBe(
      "micro-adjust-2026-06-10",
    );
  });

  it("anchors subject on weekday + lead headline", () => {
    expect(buildSubject(new Date("2026-06-10T09:00:00Z"), "Rolex Names New CEO")).toBe(
      "Wednesday: Rolex Names New CEO",
    );
  });

  it("truncates long headlines", () => {
    const subject = buildSubject(new Date("2026-06-10T09:00:00Z"), "x".repeat(100));
    expect(subject.length).toBeLessThanOrEqual("Wednesday: ".length + 70);
    expect(subject.endsWith("…")).toBe(true);
  });
});

describe("layoutBrief", () => {
  it("groups hard news by type and collects all releases", () => {
    const { news, releases } = layoutBrief([
      brief({ segment: "microbrand", type: "release", url: "https://a.com/1" }),
      brief({ segment: "luxury", type: "business", url: "https://a.com/2" }),
      brief({ segment: "vintage-auction", type: "auction", url: "https://a.com/3" }),
      brief({ segment: "mid", type: "release", url: "https://a.com/4" }),
    ]);
    expect([...news.keys()]).toEqual(["business", "auction"]);
    expect(releases).toHaveLength(2);
  });

  it("puts all hard news of one type in one section regardless of segment", () => {
    const { news } = layoutBrief([
      brief({ segment: "luxury", type: "business", url: "https://a.com/1" }),
      brief({ segment: "mid", type: "business", url: "https://a.com/2" }),
      brief({ segment: "microbrand", type: "business", url: "https://a.com/3" }),
    ]);
    expect(news.get("business")).toHaveLength(3);
  });
});

describe("buildMjml", () => {
  const date = new Date("2026-06-10T09:00:00Z");

  it("includes title, story links, summaries, and section headers", () => {
    const mjml = buildMjml(
      [brief({}), brief({ segment: "microbrand", type: "release", url: "https://a.com/b", title: "Baltic Drops Diver" })],
      date,
    );
    expect(mjml).toContain("The Micro-Adjust");
    expect(mjml).toContain("https://hodinkee.com/articles/rolex-ceo");
    expect(mjml).toContain("Rolex has a new CEO. It matters.");
    expect(mjml).toContain("Luxury &amp; Swiss Majors");
    expect(mjml).toContain("Microbrand &amp; Indie");
    expect(mjml).toContain("New Releases");
  });

  it("escapes HTML in story fields", () => {
    const mjml = buildMjml(
      [brief({ title: 'Rolex <script>alert("x")</script>' })],
      date,
    );
    expect(mjml).not.toContain("<script>");
    expect(mjml).toContain("&lt;script&gt;");
  });

  it("carries the Klaviyo unsubscribe tag and Fitwell footer", () => {
    const mjml = buildMjml([brief({})], date);
    expect(mjml).toContain("{% unsubscribe %}");
    expect(mjml).toContain("fitwellbuckle.co");
  });

  it("renders New Releases as the LAST section", () => {
    const mjml = buildMjml(
      [
        brief({ segment: "microbrand", type: "release", url: "https://a.com/r" }),
        brief({}),
      ],
      date,
    );
    const releasesAt = mjml.indexOf("New Releases");
    expect(releasesAt).toBeGreaterThan(-1);
    expect(releasesAt).toBeGreaterThan(mjml.indexOf("Luxury &amp; Swiss Majors"));
    // releases get a segment eyebrow instead of a type eyebrow
    expect(mjml.slice(releasesAt)).toContain("Microbrand &amp; Indie");
  });

  it("renders Also at links for collapsed multi-outlet coverage", () => {
    const mjml = buildMjml(
      [
        brief({
          alsoCovered: [
            { sourceName: "SJX Watches", url: "https://sjx.com/hm12" },
            { sourceName: "Monochrome Watches", url: "https://mono.com/hm12" },
          ],
        }),
      ],
      date,
    );
    expect(mjml).toContain("Also at:");
    expect(mjml).toContain("https://sjx.com/hm12");
    expect(mjml).toContain("Monochrome Watches");
  });

  it("gives every release a full card with image and summary", () => {
    const mjml = buildMjml(
      [
        brief({
          segment: "mid",
          type: "release",
          title: "Seiko 5 Sports PADI 60th",
          summary: "A 60th-anniversary PADI diver in the 5 Sports line.",
          url: "https://a.com/seiko",
          imageUrl: "https://cdn.example.com/seiko.jpg",
        }),
      ],
      date,
    );
    expect(mjml).toContain("Seiko 5 Sports PADI 60th");
    expect(mjml).toContain("https://cdn.example.com/seiko.jpg");
    expect(mjml).toContain("A 60th-anniversary PADI diver");
  });

  it("renders a clickable story image when resolved, none otherwise", () => {
    const withImage = buildMjml(
      [brief({ imageUrl: "https://cdn.example.com/hm12.jpg" })],
      date,
    );
    expect(withImage).toContain('<mj-image src="https://cdn.example.com/hm12.jpg"');
    expect(withImage).toContain('href="https://hodinkee.com/articles/rolex-ceo"');

    const without = buildMjml([brief({})], date);
    expect(without).not.toContain("<mj-image");
  });
});
