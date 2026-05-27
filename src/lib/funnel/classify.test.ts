import { describe, it, expect } from "vitest";
import { classifyRetentionStage, mapToChannel } from "./classify";

describe("classifyRetentionStage", () => {
  it("classifies a single-buyer single-unit as first_buyer", () => {
    expect(classifyRetentionStage(1, 1)).toBe("first_buyer");
  });

  it("classifies a 2-order 2-unit customer as second_buyer", () => {
    expect(classifyRetentionStage(2, 2)).toBe("second_buyer");
  });

  it("classifies a 1-order 3-unit customer as multi_unit (bulk single)", () => {
    expect(classifyRetentionStage(1, 3)).toBe("multi_unit");
  });

  it("classifies a 1-order 4-unit customer as multi_unit", () => {
    expect(classifyRetentionStage(1, 4)).toBe("multi_unit");
  });

  it("classifies a 1-order 5-unit customer as outfitter (qty rule)", () => {
    expect(classifyRetentionStage(1, 5)).toBe("outfitter");
  });

  it("classifies a 3-order 3-unit customer as outfitter (order rule)", () => {
    expect(classifyRetentionStage(3, 3)).toBe("outfitter");
  });

  it("classifies a 5-order 8-unit customer as outfitter", () => {
    expect(classifyRetentionStage(5, 8)).toBe("outfitter");
  });

  it("returns null for a customer with no orders", () => {
    expect(classifyRetentionStage(0, 0)).toBeNull();
  });

  it("treats outfitter as higher precedence than multi_unit when both apply", () => {
    // qty=5 triggers outfitter even though qty would also match multi_unit's range
    expect(classifyRetentionStage(1, 5)).toBe("outfitter");
  });

  it("matches the persona-segment counts from the 2026-05-26 cohort", () => {
    // Sanity: the segment rules mirror scripts/persona-segments.ts. If these
    // diverge, the dashboard and the script will tell different stories.
    expect(classifyRetentionStage(1, 1)).toBe("first_buyer");
    expect(classifyRetentionStage(2, 1)).toBe("second_buyer");
    expect(classifyRetentionStage(1, 3)).toBe("multi_unit");
    expect(classifyRetentionStage(3, 6)).toBe("outfitter");
  });
});

describe("mapToChannel", () => {
  it("maps Klaviyo welcome campaigns to email_klaviyo_welcome_flow", () => {
    expect(
      mapToChannel({
        utmSource: "klaviyo",
        utmMedium: "email",
        utmCampaign: "welcome-series-e1",
      }),
    ).toBe("email_klaviyo_welcome_flow");
  });

  it("maps generic Klaviyo to email_klaviyo_other", () => {
    expect(
      mapToChannel({
        utmSource: "klaviyo",
        utmMedium: "email",
        utmCampaign: "monthly-newsletter",
      }),
    ).toBe("email_klaviyo_other");
  });

  it("maps Judge.me UTMs to judgeme_re_engagement", () => {
    expect(
      mapToChannel({
        utmSource: "judgeme",
        utmMedium: null,
        utmCampaign: null,
      }),
    ).toBe("judgeme_re_engagement");
  });

  it("maps cold Meta paid to paid_meta_cold", () => {
    expect(
      mapToChannel({
        utmSource: "meta",
        utmMedium: "cpc",
        utmCampaign: "awareness-cold-watch-enthusiasts",
      }),
    ).toBe("paid_meta_cold");
  });

  it("maps Meta retargeting to paid_meta_retargeting", () => {
    expect(
      mapToChannel({
        utmSource: "facebook",
        utmMedium: "cpc",
        utmCampaign: "rt-engagers-30d",
      }),
    ).toBe("paid_meta_retargeting");
  });

  it("maps Meta organic to organic_meta", () => {
    expect(
      mapToChannel({
        utmSource: "instagram",
        utmMedium: "social",
        utmCampaign: null,
      }),
    ).toBe("organic_meta");
  });

  it("maps Google brand campaigns to paid_search_branded", () => {
    expect(
      mapToChannel({
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "brand-fitwell-exact",
      }),
    ).toBe("paid_search_branded");
  });

  it("maps Google problem campaigns to paid_search_problem", () => {
    expect(
      mapToChannel({
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "problem-watch-strap-too-tight",
      }),
    ).toBe("paid_search_problem");
  });

  it("maps Google category campaigns to paid_search_category", () => {
    expect(
      mapToChannel({
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "category-micro-adjust-buckle",
      }),
    ).toBe("paid_search_category");
  });

  it("maps Google organic to organic_search", () => {
    expect(
      mapToChannel({
        utmSource: "google",
        utmMedium: "organic",
        utmCampaign: null,
      }),
    ).toBe("organic_search");
  });

  it("maps Delugs partner to strap_maker_partnership", () => {
    expect(
      mapToChannel({
        utmSource: "delugs",
        utmMedium: null,
        utmCampaign: null,
      }),
    ).toBe("strap_maker_partnership");
  });

  it("maps Fratello to press_editorial (real data: fratello already in CSV)", () => {
    expect(
      mapToChannel({
        utmSource: "fratello",
        utmMedium: null,
        utmCampaign: null,
      }),
    ).toBe("press_editorial");
  });

  it("maps empty / null UTM to direct", () => {
    expect(
      mapToChannel({ utmSource: null, utmMedium: null, utmCampaign: null }),
    ).toBe("direct");
    expect(
      mapToChannel({ utmSource: "(direct)", utmMedium: null, utmCampaign: null }),
    ).toBe("direct");
  });

  it("maps unknown sources to other_unattributed", () => {
    expect(
      mapToChannel({
        utmSource: "some-weird-partner",
        utmMedium: "referral",
        utmCampaign: null,
      }),
    ).toBe("other_unattributed");
  });

  it("is case-insensitive on all inputs", () => {
    expect(
      mapToChannel({
        utmSource: "KLAVIYO",
        utmMedium: "EMAIL",
        utmCampaign: "WELCOME-SERIES",
      }),
    ).toBe("email_klaviyo_welcome_flow");
  });

  it("trims whitespace on UTM values", () => {
    expect(
      mapToChannel({
        utmSource: "  meta  ",
        utmMedium: "  cpc  ",
        utmCampaign: "  cold-broad  ",
      }),
    ).toBe("paid_meta_cold");
  });
});
