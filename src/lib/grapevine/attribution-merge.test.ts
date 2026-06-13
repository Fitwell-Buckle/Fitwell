import { describe, it, expect } from "vitest";
import {
  commitAttribution,
  groupKey,
  groupLabel,
  type SurveyInput,
  type UtmInput,
} from "./attribution-merge";

const ig: SurveyInput = {
  platformHint: "instagram",
  channelHint: null,
  channelDetail: null,
};
const creator: SurveyInput = {
  platformHint: "youtube",
  channelHint: "creator_partnerships",
  channelDetail: "watchchris",
};
const noSurvey: SurveyInput = null;

describe("commitAttribution", () => {
  it("commits to survey.channelHint when set (creator/forum/in-person/etc.)", () => {
    const result = commitAttribution(creator, null);
    expect(result.source).toBe("survey_committed");
    expect(result.channel).toBe("creator_partnerships");
    expect(result.platform).toBe("youtube");
    expect(result.detail).toBe("watchchris");
  });

  it("uses platform-only when survey reveals platform without committing channel", () => {
    const result = commitAttribution(ig, null);
    expect(result.source).toBe("survey_platform");
    expect(result.platform).toBe("instagram");
    expect(result.channel).toBeNull();
  });

  it("does NOT upgrade platform → channel even when UTM agrees (paid/organic ambiguity stays honest)", () => {
    // We deliberately do not turn 'instagram + meta/cpc' into 'paid_meta_cold'
    // here yet — that refinement comes after the UTM linking gap is fixed.
    // See specs/work-plans/completed/utm-linking-gap.md.
    const result = commitAttribution(ig, { source: "meta", medium: "cpc" });
    expect(result.source).toBe("survey_platform");
    expect(result.platform).toBe("instagram");
  });

  it("falls back to UTM bucket when there is no survey signal", () => {
    const result = commitAttribution(noSurvey, { source: "google", medium: "cpc" });
    expect(result.source).toBe("utm_only");
    expect(result.utmBucket).toBe("google_paid");
  });

  it("returns 'none' when neither survey nor UTM has any signal", () => {
    const result = commitAttribution(noSurvey, null);
    expect(result.source).toBe("none");
    expect(result.channel).toBeNull();
    expect(result.platform).toBeNull();
    expect(result.utmBucket).toBeNull();
  });

  describe("UTM bucket mapping", () => {
    it.each([
      [{ source: "google", medium: "cpc" }, "google_paid"],
      [{ source: "google", medium: "organic" }, "google_organic"],
      [{ source: "google", medium: null }, "google_organic"],
      [{ source: "meta", medium: "paid_social" }, "meta_paid"],
      [{ source: "facebook", medium: "cpc" }, "meta_paid"],
      [{ source: "instagram", medium: "paid_social" }, "meta_paid"],
      [{ source: "tiktok", medium: "cpc" }, "tiktok_paid"],
      [{ source: "Klaviyo", medium: "email" }, "email"],
      [{ source: "judgeme", medium: "email" }, "email"],
    ])("%o → %s", (utm, expected) => {
      const result = commitAttribution(noSurvey, utm as UtmInput);
      expect(result.utmBucket).toBe(expected);
    });
  });
});

describe("groupKey", () => {
  it("uses channel prefix when channel committed", () => {
    expect(groupKey(commitAttribution(creator, null))).toBe(
      "channel:creator_partnerships",
    );
  });

  it("uses platform prefix when only platform known", () => {
    expect(groupKey(commitAttribution(ig, null))).toBe("platform:instagram");
  });

  it("uses utm prefix when only UTM known", () => {
    expect(
      groupKey(commitAttribution(noSurvey, { source: "google", medium: "cpc" })),
    ).toBe("utm:google_paid");
  });

  it("returns 'unattributed' when no signal", () => {
    expect(groupKey(commitAttribution(noSurvey, null))).toBe("unattributed");
  });
});

describe("groupLabel", () => {
  it("labels Meta platform with 'paid/organic mix' to be honest about the ambiguity", () => {
    expect(groupLabel(commitAttribution(ig, null))).toContain("paid/organic mix");
  });

  it("labels creator partnerships cleanly without the mix caveat", () => {
    expect(groupLabel(commitAttribution(creator, null))).toBe(
      "Creator partnerships",
    );
  });
});
