import { describe, it, expect } from "vitest";
import {
  aggregateChannelsFromCustomers,
  classifyRetentionStage,
  mapMetaCampaign,
  mapToChannel,
  type CustomerOrderRollup,
} from "./classify";

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

describe("mapMetaCampaign", () => {
  it("returns 'unknown' for null / undefined / empty", () => {
    expect(mapMetaCampaign(null)).toBe("unknown");
    expect(mapMetaCampaign(undefined)).toBe("unknown");
    expect(mapMetaCampaign("")).toBe("unknown");
  });

  it("classifies explicit retargeting campaigns", () => {
    expect(mapMetaCampaign("Retargeting Visitors 60d")).toBe("retargeting");
    expect(mapMetaCampaign("retarget-engagers")).toBe("retargeting");
    expect(mapMetaCampaign("Watch — Retargeting (30d)")).toBe("retargeting");
  });

  it("classifies RT-prefixed / suffixed campaigns as retargeting", () => {
    expect(mapMetaCampaign("RT - Engagers 30d")).toBe("retargeting");
    expect(mapMetaCampaign("RT_engagers_30d")).toBe("retargeting");
    expect(mapMetaCampaign("summer_2026_rt_warm")).toBe("retargeting");
    expect(mapMetaCampaign("V3-RT-cart-abandoners")).toBe("retargeting");
  });

  it("classifies cold / awareness campaigns as cold", () => {
    expect(mapMetaCampaign("Awareness - Cold - Watch Enthusiasts")).toBe(
      "cold",
    );
    expect(mapMetaCampaign("TOFU - broad audience")).toBe("cold");
    expect(mapMetaCampaign("Spring 2026 launch")).toBe("cold");
  });

  it("defaults unrecognized non-retargeting names to cold", () => {
    expect(mapMetaCampaign("MOFU - Considerers")).toBe("cold");
    expect(mapMetaCampaign("V2_test_campaign")).toBe("cold");
    expect(mapMetaCampaign("Some random name with no hint")).toBe("cold");
  });

  it("does NOT false-match 'rt' inside words", () => {
    // The 'rt' regex is bounded so it doesn't fire on 'art', 'cart', 'sport'.
    expect(mapMetaCampaign("art-collector-audience")).toBe("cold");
    expect(mapMetaCampaign("Sport watch enthusiasts")).toBe("cold");
    expect(mapMetaCampaign("Cart-targeted creative")).toBe("cold");
  });

  it("is case-insensitive", () => {
    expect(mapMetaCampaign("RETARGET")).toBe("retargeting");
    expect(mapMetaCampaign("ReTaRgEt")).toBe("retargeting");
  });
});

describe("aggregateChannelsFromCustomers", () => {
  // Realistic fixture mirroring real-data shape: a few customers per
  // channel, mixed retention stages, two channels with overlap.
  const fixture: CustomerOrderRollup[] = [
    // paid_meta_cold customers
    {
      utmSource: "meta",
      utmMedium: "cpc",
      utmCampaign: "awareness-cold",
      orderCount: 1,
      totalSpentCents: 4000,
      totalQty: 1,
    }, // first_buyer
    {
      utmSource: "meta",
      utmMedium: "cpc",
      utmCampaign: "awareness-cold",
      orderCount: 1,
      totalSpentCents: 4000,
      totalQty: 1,
    }, // first_buyer
    {
      utmSource: "meta",
      utmMedium: "cpc",
      utmCampaign: "awareness-cold",
      orderCount: 3,
      totalSpentCents: 18000,
      totalQty: 6,
    }, // outfitter
    // direct customers
    {
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      orderCount: 1,
      totalSpentCents: 4000,
      totalQty: 3,
    }, // multi_unit
    {
      utmSource: "(direct)",
      utmMedium: null,
      utmCampaign: null,
      orderCount: 2,
      totalSpentCents: 8000,
      totalQty: 2,
    }, // second_buyer
    // klaviyo welcome
    {
      utmSource: "klaviyo",
      utmMedium: "email",
      utmCampaign: "welcome-flow-e1",
      orderCount: 5,
      totalSpentCents: 30000,
      totalQty: 8,
    }, // outfitter
  ];

  it("buckets customers into the right channels with correct counts", () => {
    const rows = aggregateChannelsFromCustomers(fixture);
    const byChannel = new Map(rows.map((r) => [r.channel, r]));

    expect(byChannel.get("paid_meta_cold")?.customers).toBe(3);
    expect(byChannel.get("direct")?.customers).toBe(2);
    expect(byChannel.get("email_klaviyo_welcome_flow")?.customers).toBe(1);
  });

  it("computes segmentMix counts that sum to the channel's customer count", () => {
    const rows = aggregateChannelsFromCustomers(fixture);
    for (const r of rows) {
      const mixSum = Object.values(r.segmentMix).reduce((a, b) => a + b, 0);
      expect(mixSum).toBe(r.customers);
    }
  });

  it("populates the right stages in segmentMix per channel", () => {
    const rows = aggregateChannelsFromCustomers(fixture);
    const meta = rows.find((r) => r.channel === "paid_meta_cold")!;
    expect(meta.segmentMix.first_buyer).toBe(2);
    expect(meta.segmentMix.outfitter).toBe(1);
    expect(meta.segmentMix.second_buyer).toBe(0);

    const direct = rows.find((r) => r.channel === "direct")!;
    expect(direct.segmentMix.multi_unit).toBe(1);
    expect(direct.segmentMix.second_buyer).toBe(1);
  });

  it("sums orders + revenue per channel correctly", () => {
    const rows = aggregateChannelsFromCustomers(fixture);
    const meta = rows.find((r) => r.channel === "paid_meta_cold")!;
    expect(meta.orders).toBe(1 + 1 + 3);
    expect(meta.totalSpendCents).toBe(4000 + 4000 + 18000);
  });

  it("computes avgLtvCents as totalSpend / customers, rounded", () => {
    const rows = aggregateChannelsFromCustomers(fixture);
    const meta = rows.find((r) => r.channel === "paid_meta_cold")!;
    // (4000 + 4000 + 18000) / 3 = 8666.67 → 8667
    expect(meta.avgLtvCents).toBe(8667);
  });

  it("sorts channels by total revenue descending", () => {
    const rows = aggregateChannelsFromCustomers(fixture);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].totalSpendCents).toBeGreaterThanOrEqual(
        rows[i].totalSpendCents,
      );
    }
  });

  it("filters to a single segment when segmentFilter is set", () => {
    const rows = aggregateChannelsFromCustomers(fixture, "outfitter");
    // Only 2 outfitter customers in the fixture (1 paid_meta_cold, 1 klaviyo)
    const totalCustomers = rows.reduce((s, r) => s + r.customers, 0);
    expect(totalCustomers).toBe(2);
    // Every row's segmentMix should be outfitter-only
    for (const r of rows) {
      expect(r.segmentMix.first_buyer).toBe(0);
      expect(r.segmentMix.second_buyer).toBe(0);
      expect(r.segmentMix.multi_unit).toBe(0);
      expect(r.segmentMix.outfitter).toBeGreaterThan(0);
    }
  });

  it("drops customers with no orders (orderCount = 0)", () => {
    const withOrphan: CustomerOrderRollup[] = [
      ...fixture,
      {
        utmSource: "meta",
        utmMedium: "cpc",
        utmCampaign: "test",
        orderCount: 0,
        totalSpentCents: 0,
        totalQty: 0,
      },
    ];
    const beforeRows = aggregateChannelsFromCustomers(fixture);
    const afterRows = aggregateChannelsFromCustomers(withOrphan);
    const beforeTotal = beforeRows.reduce((s, r) => s + r.customers, 0);
    const afterTotal = afterRows.reduce((s, r) => s + r.customers, 0);
    expect(afterTotal).toBe(beforeTotal);
  });

  it("returns an empty array for empty input", () => {
    expect(aggregateChannelsFromCustomers([])).toEqual([]);
  });

  it("respects channel labels from CHANNEL_LABELS", () => {
    const rows = aggregateChannelsFromCustomers(fixture);
    const meta = rows.find((r) => r.channel === "paid_meta_cold")!;
    expect(meta.label).toBe("Meta paid (cold)");
  });

  describe("with display-metric overrides (position filter)", () => {
    // A customer whose lifetime metrics put them in the outfitter
    // segment (3 orders / 6 units), but the caller is filtering to
    // acquisition orders only — so displayed metrics show just 1
    // order at $40 (their first purchase).
    const positionFiltered: CustomerOrderRollup[] = [
      {
        utmSource: "meta",
        utmMedium: "cpc",
        utmCampaign: "awareness-cold",
        orderCount: 3, // lifetime — used for classification
        totalSpentCents: 18000,
        totalQty: 6,
        displayedOrders: 1, // first-order subset
        displayedSpentCents: 4000,
      },
    ];

    it("uses lifetime metrics for stage classification, not displayed", () => {
      // Customer's lifetime is 3 orders / 6 units → outfitter. Even
      // though the displayed orders is 1 (which would classify as
      // first_buyer if classification looked at displayed), the
      // segmentMix should still show outfitter.
      const rows = aggregateChannelsFromCustomers(positionFiltered);
      expect(rows).toHaveLength(1);
      expect(rows[0].segmentMix.outfitter).toBe(1);
      expect(rows[0].segmentMix.first_buyer).toBe(0);
    });

    it("uses displayed metrics for the orders + revenue columns", () => {
      const rows = aggregateChannelsFromCustomers(positionFiltered);
      expect(rows[0].orders).toBe(1); // displayedOrders, not lifetime 3
      expect(rows[0].totalSpendCents).toBe(4000); // displayedSpentCents, not lifetime 18000
    });

    it("avgLtv is computed against displayed spend, not lifetime", () => {
      const rows = aggregateChannelsFromCustomers(positionFiltered);
      // 4000 / 1 customer = 4000
      expect(rows[0].avgLtvCents).toBe(4000);
    });

    it("falls back to lifetime metrics when display overrides are not provided", () => {
      // Existing tests already cover this, but make it explicit: an
      // input without displayedOrders should behave exactly as before.
      const noOverride: CustomerOrderRollup[] = [
        {
          utmSource: "meta",
          utmMedium: "cpc",
          utmCampaign: "awareness-cold",
          orderCount: 3,
          totalSpentCents: 18000,
          totalQty: 6,
        },
      ];
      const rows = aggregateChannelsFromCustomers(noOverride);
      expect(rows[0].orders).toBe(3);
      expect(rows[0].totalSpendCents).toBe(18000);
    });

    it("combines with segmentFilter correctly", () => {
      // segmentFilter narrows by lifetime classification; position
      // overrides only affect displayed metrics. Together: only
      // include outfitter customers, but show their first-order
      // metrics only.
      const mixed: CustomerOrderRollup[] = [
        // Outfitter — should be included
        {
          utmSource: "meta",
          utmMedium: "cpc",
          utmCampaign: "awareness-cold",
          orderCount: 3,
          totalSpentCents: 18000,
          totalQty: 6,
          displayedOrders: 1,
          displayedSpentCents: 4000,
        },
        // first_buyer — should be excluded by segmentFilter='outfitter'
        {
          utmSource: "meta",
          utmMedium: "cpc",
          utmCampaign: "awareness-cold",
          orderCount: 1,
          totalSpentCents: 4000,
          totalQty: 1,
          displayedOrders: 1,
          displayedSpentCents: 4000,
        },
      ];
      const rows = aggregateChannelsFromCustomers(mixed, "outfitter");
      expect(rows[0].customers).toBe(1);
      expect(rows[0].orders).toBe(1);
      expect(rows[0].totalSpendCents).toBe(4000);
    });
  });
});
