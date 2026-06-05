import { describe, it, expect } from "vitest";
import { mapAnswerToChannel, parseOtherSuffix } from "./channel-mapping";

describe("mapAnswerToChannel", () => {
  describe("platform-only answers — survey reveals platform but NOT paid vs organic", () => {
    it.each([
      ["Social Media: Instagram", "instagram"],
      ["Social Media: Facebook", "facebook"],
      ["Social Media: TikTok", "tiktok"],
      ["Social Media: X (formerly Twitter)", "twitter"],
    ])("maps %s → platform=%s, channelHint null (Phase 3 resolves with UTM)", (input, platform) => {
      const result = mapAnswerToChannel(input);
      expect(result?.platformHint).toBe(platform);
      expect(result?.channelHint).toBeUndefined();
    });

    it("Google search is platform-only — could be paid branded, organic, or category", () => {
      const result = mapAnswerToChannel("Search Engine: Google");
      expect(result?.platformHint).toBe("google_search");
      expect(result?.channelHint).toBeUndefined();
    });

    it("DuckDuckGo and other alt search engines are platform-only", () => {
      expect(mapAnswerToChannel("Search Engine: DuckDuckGo")?.platformHint).toBe(
        "duckduckgo",
      );
    });

    it("Bing surfaces via the prefix fallback", () => {
      const result = mapAnswerToChannel("Search Engine: Bing");
      expect(result?.platformHint).toBe("bing");
      expect(result?.channelHint).toBeUndefined();
      expect(result?.channelDetail).toBe("bing");
    });

    it("Threads via the social-media prefix fallback", () => {
      const result = mapAnswerToChannel("Social Media: Threads");
      expect(result?.platformHint).toBe("threads");
      expect(result?.channelHint).toBeUndefined();
    });
  });

  describe("YouTube — platform is youtube; channel commits when it's a creator", () => {
    it("Fitwell-owned YouTube stays platform-only (we can run YouTube ads from the same channel)", () => {
      const result = mapAnswerToChannel("YouTube Video: Fitwell YouTube Video");
      expect(result?.platformHint).toBe("youtube");
      expect(result?.channelHint).toBeUndefined();
      expect(result?.channelDetail).toBe("fitwell_owned");
    });

    it("creator YouTube videos commit to creator_partnerships AND set platform=youtube", () => {
      const result = mapAnswerToChannel("YouTube Video: WatchChris");
      expect(result?.platformHint).toBe("youtube");
      expect(result?.channelHint).toBe("creator_partnerships");
      expect(result?.channelDetail).toBe("watchchris");
    });

    it("collapses 'Watch Chris' to the same detail as 'WatchChris' so the typo split groups together", () => {
      const a = mapAnswerToChannel("YouTube Video: Watch Chris");
      const b = mapAnswerToChannel("YouTube Video: WatchChris");
      expect(a?.channelDetail).toBe(b?.channelDetail);
    });
  });

  describe("forums", () => {
    it.each([
      ["Watch Forum: WatchUSeek", "forum_reddit_organic", "watchuseek"],
      ["Watch Forum: Reddit", "forum_reddit_organic", "reddit"],
      [
        "Watch Forum: Korea Watch Community (와치홀릭)",
        "forum_other",
        "korea_watch_community",
      ],
    ])("maps %s → channelHint=%s (forums commit; paid forum placements are rare)", (input, hint, detail) => {
      const result = mapAnswerToChannel(input);
      expect(result?.channelHint).toBe(hint);
      expect(result?.channelDetail).toBe(detail);
    });

    it("unknown forum names land in forum_other via the prefix fallback", () => {
      const result = mapAnswerToChannel("Watch Forum: Klocksnack");
      expect(result?.channelHint).toBe("forum_other");
      expect(result?.channelDetail).toBe("klocksnack");
    });
  });

  describe("committed channels (no paid/organic ambiguity)", () => {
    it("friend/family commits to in_person_sighting", () => {
      expect(mapAnswerToChannel("A Friend or Family Member")?.channelHint).toBe(
        "in_person_sighting",
      );
    });

    it("AI tools commit to ai_search_recommendation", () => {
      const result = mapAnswerToChannel("AI - ChatGPT, Claude, Etc.: ChatGPT");
      expect(result?.channelHint).toBe("ai_search_recommendation");
      expect(result?.channelDetail).toBe("chatgpt");
    });

    it("Blog or Article commits to press_editorial", () => {
      expect(mapAnswerToChannel("Blog or Article: Hodinkee")?.channelHint).toBe(
        "press_editorial",
      );
    });

    it("Watch events commit to trade_shows", () => {
      const result = mapAnswerToChannel(
        "Met Us at a Watch Event: San Francisco Windup Watch Fair 2025",
      );
      expect(result?.channelHint).toBe("trade_shows");
      expect(result?.channelDetail).toBe("sanfranciscowindupwatchfair2025");
    });
  });

  describe("normalization", () => {
    it("'montre de luxe' and 'Montre de luxe' produce the same detail (case-insensitive)", () => {
      const a = mapAnswerToChannel("Blog or Article: montre de luxe");
      const b = mapAnswerToChannel("Blog or Article: Montre de luxe");
      expect(a?.channelDetail).toBe(b?.channelDetail);
    });

    it("trims surrounding whitespace before lookup", () => {
      expect(mapAnswerToChannel("  Social Media: Instagram  ")?.platformHint).toBe(
        "instagram",
      );
    });
  });

  describe("fallback behaviour", () => {
    it("returns null for the top-level 'Other' label (Phase 4 normalizes free text)", () => {
      expect(mapAnswerToChannel("Other")).toBeNull();
    });

    it("returns null for unknown labels", () => {
      expect(mapAnswerToChannel("Some Channel We Never Configured")).toBeNull();
    });

    it("returns null for empty / whitespace / nullish input", () => {
      expect(mapAnswerToChannel(null)).toBeNull();
      expect(mapAnswerToChannel(undefined)).toBeNull();
      expect(mapAnswerToChannel("")).toBeNull();
      expect(mapAnswerToChannel("   ")).toBeNull();
    });

    it("returns null when a category prefix has no detail after it", () => {
      expect(mapAnswerToChannel("Watch Forum: ")).toBeNull();
      expect(mapAnswerToChannel("Search Engine:    ")).toBeNull();
    });
  });
});

describe("parseOtherSuffix", () => {
  it("detects the Grapevine '(* other)' suffix and strips it", () => {
    expect(parseOtherSuffix("Delugs (* other)")).toEqual({
      isOther: true,
      cleanedAnswer: "Delugs",
    });
  });

  it("returns isOther=false when the suffix is absent", () => {
    expect(parseOtherSuffix("Social Media: Instagram")).toEqual({
      isOther: false,
      cleanedAnswer: "Social Media: Instagram",
    });
  });

  it("returns nulls for empty/whitespace/nullish input", () => {
    expect(parseOtherSuffix(null)).toEqual({ isOther: false, cleanedAnswer: null });
    expect(parseOtherSuffix(undefined)).toEqual({ isOther: false, cleanedAnswer: null });
    expect(parseOtherSuffix("")).toEqual({ isOther: false, cleanedAnswer: null });
    expect(parseOtherSuffix("   ")).toEqual({ isOther: false, cleanedAnswer: null });
  });
});
