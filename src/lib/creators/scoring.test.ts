import { describe, expect, it } from "vitest";
import {
  activityComponent,
  chooseEmail,
  classifyEmailKind,
  crossPlatformFit,
  emailBonusComponent,
  engagementComponent,
  extractEmails,
  fitScore,
  igEngagementRate,
  mentionsFitwell,
  normalizeHandle,
  primaryPlatform,
  relevanceComponent,
  sizeFitComponent,
  stripWatchVerbUsages,
  watchConfidence,
  watchScore,
  ytEngagementRate,
} from "./scoring";

describe("watchScore", () => {
  it("counts whole-word keyword matches with weights", () => {
    // horology (5) + chronograph (3) + rolex (4) = 12
    expect(watchScore("A horology channel reviewing the Rolex chronograph")).toBe(12);
  });

  it("does not match keywords inside other words", () => {
    // "watchful" should not match "watch"
    expect(watchScore("a watchful eye on the market")).toBe(0);
  });

  it("strips 'watch' verb usages before counting", () => {
    expect(watchScore("watch this video and watch me unbox it")).toBe(0);
    expect(watchScore("watching the game, watched it live")).toBe(0);
  });

  it("still counts noun usage alongside verb usage", () => {
    // "watch this" stripped; "dive watch" counts as dive watch (4) + watch (1)
    expect(watchScore("watch this review of my dive watch")).toBe(5);
  });

  it("caps each keyword's contribution", () => {
    const spam = Array(20).fill("rolex").join(" ");
    // default cap 5 → 5 × 4 = 20
    expect(watchScore(spam)).toBe(20);
    // caption-heavy cap 8 → 8 × 4 = 32
    expect(watchScore(spam, 8)).toBe(32);
  });

  it("matches multi-word and hyphenated keywords", () => {
    // grand seiko (5) + seiko (3) — "seiko" also matches inside the phrase
    expect(watchScore("the grand seiko lineup")).toBe(8);
    expect(watchScore("my g-shock collection")).toBe(4);
    expect(watchScore("micro-adjust clasp")).toBe(5);
  });

  it("is case-insensitive", () => {
    expect(watchScore("HOROLOGY")).toBe(5);
  });

  it("returns 0 for empty input", () => {
    expect(watchScore("")).toBe(0);
  });
});

describe("stripWatchVerbUsages", () => {
  it("removes verb patterns but keeps other text", () => {
    const out = stripWatchVerbUsages("watch this rolex video");
    expect(out).not.toMatch(/watch this/);
    expect(out).toMatch(/rolex/);
  });
});

describe("watchConfidence", () => {
  it("uses IG thresholds", () => {
    expect(watchConfidence(60, "ig")).toBe("high");
    expect(watchConfidence(59, "ig")).toBe("medium");
    expect(watchConfidence(25, "ig")).toBe("medium");
    expect(watchConfidence(24, "ig")).toBe("low");
    expect(watchConfidence(8, "ig")).toBe("low");
    expect(watchConfidence(7, "ig")).toBe("none");
  });

  it("uses lower YT thresholds", () => {
    expect(watchConfidence(40, "yt")).toBe("high");
    expect(watchConfidence(39, "yt")).toBe("medium");
    expect(watchConfidence(15, "yt")).toBe("medium");
    expect(watchConfidence(14, "yt")).toBe("low");
    expect(watchConfidence(5, "yt")).toBe("low");
    expect(watchConfidence(4, "yt")).toBe("none");
  });
});

describe("engagement rates (§2)", () => {
  it("IG: mean of (likes+comments)/followers ×100", () => {
    const er = igEngagementRate(
      [
        { likes: 100, comments: 20 },
        { likes: 200, comments: 40 },
      ],
      10_000,
    );
    // (120/10000 + 240/10000)/2 × 100 = 1.8
    expect(er).toBeCloseTo(1.8);
  });

  it("IG: null without followers or posts", () => {
    expect(igEngagementRate([], 10_000)).toBeNull();
    expect(igEngagementRate([{ likes: 1, comments: 1 }], 0)).toBeNull();
  });

  it("YT: mean of (likes+comments)/views ×100, skipping zero-view videos", () => {
    const er = ytEngagementRate([
      { likes: 50, comments: 10, views: 1_000 },
      { likes: 0, comments: 0, views: 0 }, // skipped
      { likes: 30, comments: 10, views: 2_000 },
    ]);
    // (60/1000 + 40/2000)/2 × 100 = (6 + 2)/2 = 4
    expect(er).toBeCloseTo(4);
  });

  it("YT: null when no videos have views", () => {
    expect(ytEngagementRate([{ likes: 1, comments: 1, views: 0 }])).toBeNull();
  });
});

describe("fit_score components", () => {
  it("relevance caps at 100", () => {
    expect(relevanceComponent(250)).toBe(100);
    expect(relevanceComponent(500)).toBe(100);
    expect(relevanceComponent(125)).toBe(50);
    expect(relevanceComponent(0)).toBe(0);
  });

  it("engagement: 5% ER → 100, capped", () => {
    expect(engagementComponent(5)).toBe(100);
    expect(engagementComponent(12)).toBe(100);
    expect(engagementComponent(2.5)).toBe(50);
  });

  it("size_fit peaks in the 10K–100K band", () => {
    expect(sizeFitComponent(50_000)).toBe(100);
    expect(sizeFitComponent(10_000)).toBe(100);
    expect(sizeFitComponent(100_000)).toBe(100);
    expect(sizeFitComponent(7_000)).toBe(80);
    expect(sizeFitComponent(150_000)).toBe(80);
    expect(sizeFitComponent(300_000)).toBe(65);
    expect(sizeFitComponent(750_000)).toBe(50);
    expect(sizeFitComponent(2_000_000)).toBe(30);
    expect(sizeFitComponent(2_000)).toBe(40);
    expect(sizeFitComponent(500)).toBe(10);
  });

  it("activity decays with days since last post", () => {
    expect(activityComponent(7)).toBe(100);
    expect(activityComponent(20)).toBe(85);
    expect(activityComponent(45)).toBe(65);
    expect(activityComponent(75)).toBe(45);
    expect(activityComponent(120)).toBe(20);
    expect(activityComponent(365)).toBe(5);
    expect(activityComponent(null)).toBe(0);
  });

  it("email bonus by kind", () => {
    expect(emailBonusComponent("business")).toBe(100);
    expect(emailBonusComponent("personal")).toBe(70);
    expect(emailBonusComponent("manager")).toBe(70);
    expect(emailBonusComponent(null)).toBe(0);
  });
});

describe("fitScore", () => {
  it("computes the weighted formula on full data", () => {
    // relevance=100 (ws 250), engagement=100 (5%), size=100 (50K),
    // activity=100 (7d), email=100 → fit 100
    const r = fitScore({
      watchScore: 250,
      erPct: 5,
      followers: 50_000,
      daysSinceLastPost: 7,
      emailKind: "business",
    });
    expect(r.fitScore).toBe(100);
    expect(r.partial).toBe(false);
  });

  it("matches a hand-computed mid-range example", () => {
    // relevance = 125/2.5 = 50 → ×0.30 = 15
    // engagement = 2 × 20 = 40 → ×0.25 = 10
    // size = 7000 → 80 → ×0.15 = 12
    // activity = 45d → 65 → ×0.10 = 6.5
    // email personal → 70 → ×0.20 = 14
    // total = 57.5
    const r = fitScore({
      watchScore: 125,
      erPct: 2,
      followers: 7_000,
      daysSinceLastPost: 45,
      emailKind: "personal",
    });
    expect(r.fitScore).toBeCloseTo(57.5);
    expect(r.partial).toBe(false);
  });

  it("renormalises profile-only rows over the remaining 65 weight", () => {
    // relevance 50 ×30 + size 100 ×15 + email 100 ×20 = 1500+1500+2000=5000
    // → 5000/65 ≈ 76.92
    const r = fitScore({
      watchScore: 125,
      followers: 20_000,
      emailKind: "business",
      erPct: null,
      daysSinceLastPost: null,
    });
    expect(r.fitScore).toBeCloseTo(5000 / 65, 5);
    expect(r.partial).toBe(true);
  });

  it("does not renormalise when only one of engagement/activity is missing", () => {
    const r = fitScore({
      watchScore: 125,
      followers: 20_000,
      emailKind: "business",
      erPct: 2,
      daysSinceLastPost: null,
    });
    expect(r.partial).toBe(false);
    // activity contributes 0
    expect(r.fitScore).toBeCloseTo(50 * 0.3 + 40 * 0.25 + 100 * 0.15 + 0 + 100 * 0.2);
  });
});

describe("crossPlatformFit", () => {
  it("single platform passes through", () => {
    expect(crossPlatformFit([70])).toBe(70);
  });

  it("max + 0.2 × min for two platforms", () => {
    expect(crossPlatformFit([70, 60])).toBeCloseTo(82);
    expect(crossPlatformFit([60, 70])).toBeCloseTo(82);
  });

  it("empty → 0", () => {
    expect(crossPlatformFit([])).toBe(0);
  });
});

describe("primaryPlatform", () => {
  it("pure follower comparison, YT wins ties", () => {
    expect(primaryPlatform(10_000, 10_000)).toBe("yt");
    expect(primaryPlatform(20_000, 10_000)).toBe("ig");
    expect(primaryPlatform(5_000, 50_000)).toBe("yt");
  });

  it("falls back to the platform that exists", () => {
    expect(primaryPlatform(10_000, null)).toBe("ig");
    expect(primaryPlatform(null, 10_000)).toBe("yt");
    expect(primaryPlatform(null, null)).toBeNull();
  });
});

describe("mentionsFitwell", () => {
  it("detects brand terms case-insensitively", () => {
    expect(mentionsFitwell("Thanks to FITWELL for the buckle")).toBe(true);
    expect(mentionsFitwell("link: fitwellbuckle.co/products")).toBe(true);
    expect(mentionsFitwell("@fitwellbuckle sent me this")).toBe(true);
    expect(mentionsFitwell("my fit well being routine")).toBe(false);
    expect(mentionsFitwell(null)).toBe(false);
  });
});

describe("email extraction", () => {
  it("extracts plain emails", () => {
    expect(extractEmails("contact: hello@watchguy.com for collabs")).toEqual([
      "hello@watchguy.com",
    ]);
  });

  it("extracts bracket-obfuscated emails", () => {
    expect(extractEmails("reach me: john [at] watchreviews [dot] com")).toEqual([
      "john@watchreviews.com",
    ]);
    expect(extractEmails("john (at) watchreviews.com")).toEqual([
      "john@watchreviews.com",
    ]);
  });

  it("does NOT match bare 'at' obfuscation (false-positive guard)", () => {
    expect(extractEmails("i really appreciate.in this content at scale")).toEqual([]);
  });

  it("filters image-extension and short-local false positives", () => {
    expect(extractEmails("see pic@2x.png and a@b.com")).toEqual([]);
  });

  it("rejects bogus TLDs, accepts country codes", () => {
    expect(extractEmails("x@y.invalidtld")).toEqual([]);
    expect(extractEmails("uhrwerk@zeit.de")).toEqual(["uhrwerk@zeit.de"]);
  });

  it("dedupes and lowercases", () => {
    expect(
      extractEmails("Hello@Watch.com and hello@watch.com"),
    ).toEqual(["hello@watch.com"]);
  });
});

describe("classifyEmailKind / chooseEmail", () => {
  it("classifies business-style local parts", () => {
    expect(classifyEmailKind("info@studio.com")).toBe("business");
    expect(classifyEmailKind("collabs.mike@gmail.com")).toBe("business");
    expect(classifyEmailKind("mike87@gmail.com")).toBe("personal");
  });

  it("does not fire on substrings inside words", () => {
    // "pr" inside "april" must not classify as business
    expect(classifyEmailKind("april@gmail.com")).toBe("personal");
  });

  it("chooseEmail prefers business", () => {
    expect(chooseEmail(["mike@gmail.com", "press@mike.com"])).toBe("press@mike.com");
    expect(chooseEmail(["mike@gmail.com"])).toBe("mike@gmail.com");
    expect(chooseEmail([])).toBeNull();
  });
});

describe("normalizeHandle", () => {
  it("strips @ and lowercases", () => {
    expect(normalizeHandle("@WatchGuy")).toBe("watchguy");
    expect(normalizeHandle("  @@weird ")).toBe("weird");
  });
});
