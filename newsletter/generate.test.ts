import { describe, expect, it } from "vitest";
import { NEWSLETTER, buildSubject, campaignSlug } from "./config";
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

  it("buckets reviews and podcasts into their own groups, not into news", () => {
    const { news, releases, reviews, podcasts } = layoutBrief([
      brief({ type: "business", url: "https://a.com/1" }),
      brief({ type: "review", url: "https://a.com/2" }),
      brief({ type: "review", url: "https://a.com/3" }),
      brief({ type: "podcast", url: "https://a.com/4" }),
    ]);
    expect([...news.keys()]).toEqual(["business"]);
    expect(releases).toHaveLength(0);
    expect(reviews).toHaveLength(2);
    expect(podcasts).toHaveLength(1);
  });

  it("routes community/culture into the news map under Community & Culture", () => {
    const { news } = layoutBrief([
      brief({ type: "community", url: "https://a.com/1" }),
    ]);
    expect(news.get("community")).toHaveLength(1);
  });
});

describe("buildMjml", () => {
  const date = new Date("2026-06-10T09:00:00Z");

  it("includes title, story links, summaries, and section headers", () => {
    const mjml = buildMjml(
      [brief({}), brief({ segment: "microbrand", type: "release", url: "https://a.com/b", title: "Baltic Drops Diver" })],
      date,
    );
    expect(mjml).toContain("The Daily Micro-Adjust");
    expect(mjml).toContain("https://hodinkee.com/articles/rolex-ceo");
    expect(mjml).toContain("Rolex has a new CEO. It matters.");
    expect(mjml).toContain("Hodinkee"); // source eyebrow (no brand-tier tag)
    expect(mjml).toContain("Business &amp; Industry"); // type-led section header
    expect(mjml).toContain("New Releases");
  });

  it("renders Reviews and Podcasts section headers when present", () => {
    const mjml = buildMjml(
      [
        brief({}),
        brief({ type: "review", url: "https://a.com/r", title: "Hands-On: The Diver", summary: "Worn & Wound finds it solid." }),
        brief({ type: "podcast", url: "https://a.com/p", title: "Episode 5", summary: "An hour on dial supply." }),
        brief({ type: "community", url: "https://a.com/c", title: "A Collector's Story" }),
      ],
      date,
    );
    expect(mjml).toContain("Reviews");
    expect(mjml).toContain("Podcasts");
    expect(mjml).toContain("Community &amp; Culture");
    expect(mjml).toContain("https://a.com/p");
  });

  it("omits Reviews and Podcasts sections when there are none", () => {
    const mjml = buildMjml([brief({})], date);
    expect(mjml).not.toContain("Reviews");
    expect(mjml).not.toContain("Podcasts");
  });

  it("does not render brand-tier (segment) labels", () => {
    const mjml = buildMjml(
      [brief({}), brief({ segment: "microbrand", type: "release", url: "https://a.com/b" })],
      date,
    );
    expect(mjml).not.toContain("Swiss Majors");
    expect(mjml).not.toContain("Microbrand");
    expect(mjml).not.toContain("Mid-Tier");
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

  it("includes the compliance footer (address, preferences, privacy, contact)", () => {
    const mjml = buildMjml([brief({})], date);
    // Physical address + sender identity from Klaviyo org settings (CAN-SPAM/CASL)
    expect(mjml).toContain("{{ organization.name }}");
    expect(mjml).toContain("{{ organization.full_address }}");
    // Preference management + unsubscribe
    expect(mjml).toContain("{% manage_preferences %}");
    expect(mjml).toContain("{% unsubscribe %}");
    // Reason-for-receipt line, privacy policy (GDPR) and contact (CASL)
    expect(mjml).toContain("You're receiving this because you subscribed");
    expect(mjml).toContain("/policies/privacy-policy");
    expect(mjml).toContain("mailto:info@fitwellbuckle.co");
  });

  it("uses the given preheader as the email preview text", () => {
    const withPreheader = buildMjml([brief({})], date, "preview", "13 new releases inside");
    expect(withPreheader).toContain("<mj-preview>13 new releases inside</mj-preview>");
    // defaults to the tagline when none is supplied
    const without = buildMjml([brief({})], date);
    expect(without).toContain(`<mj-preview>${NEWSLETTER.tagline}`);
  });

  it("renders New Releases as the LAST section", () => {
    const mjml = buildMjml(
      [
        brief({ type: "release", url: "https://a.com/r", title: "Baltic Drops Diver" }),
        brief({}),
      ],
      date,
    );
    const releasesAt = mjml.indexOf("New Releases");
    expect(releasesAt).toBeGreaterThan(-1);
    expect(releasesAt).toBeGreaterThan(mjml.indexOf("Business &amp; Industry"));
    // the release story sits inside the (last) New Releases section
    expect(mjml.slice(releasesAt)).toContain("Baltic Drops Diver");
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

    // No story image → no story <mj-image> (the masthead logo is separate).
    const without = buildMjml([brief({})], date);
    expect(without).not.toContain("cdn.example.com");
    expect(without).not.toContain('alt="Rolex Names New CEO"');
  });

  it("renders white masthead logo, black module logo, and a rotating module", () => {
    const mjml = buildMjml([brief({})], date, "micro-adjust-2026-06-11");
    expect(mjml).toContain("fitwell-mark-white-2026.png"); // masthead (dark bg)
    expect(mjml).toContain("fitwell-mark-gold-2026.png"); // module (cream bg)
    // sponsor CTA carries a per-module utm_content
    expect(mjml).toMatch(/utm_content=module-[a-z]+/);
    expect(mjml).toContain("utm_campaign=micro-adjust-2026-06-11");
  });

  it("places the sponsor module right after Business & Industry", () => {
    const mjml = buildMjml(
      [
        brief({}), // business → hard news section
        brief({ type: "release", url: "https://a.com/r", title: "Baltic Diver" }),
      ],
      date,
    );
    const newsAt = mjml.indexOf("Business &amp; Industry");
    const sponsorAt = mjml.indexOf("utm_content=module-"); // only the sponsor CTA has this
    const releasesAt = mjml.indexOf("New Releases");
    expect(newsAt).toBeLessThan(sponsorAt);
    expect(sponsorAt).toBeLessThan(releasesAt);
  });
});
