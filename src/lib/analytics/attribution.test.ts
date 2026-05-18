import { describe, it, expect, vi } from "vitest";

// attribution.ts imports the live Drizzle/Neon db at module load. Stub it so the
// pure mapUtmToChannel logic can be tested without a database connection.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/schema", () => ({ utmAttribution: {} }));

import { mapUtmToChannel } from "@/lib/analytics/attribution";

describe("mapUtmToChannel", () => {
  it.each([
    ["google", "cpc", "paid_search"],
    [null, "ppc", "paid_search"],
    ["anything", "paid", "paid_search"],
    ["google", "organic", "organic_search"],
    ["google", null, "organic_search"],
    ["bing", "", "organic_search"],
    [null, "email", "email"],
    ["resend", null, "email"],
    ["mailchimp", "newsletter", "email"],
    [null, "social", "social"],
    ["facebook", null, "social"],
    ["instagram", "", "social"],
    ["tiktok", null, "social"],
    ["partnersite", "referral", "referral"],
    [null, null, "direct"],
    ["", "", "direct"],
    ["randomblog", "banner", "other"],
  ] as const)("(%s, %s) → %s", (source, medium, expected) => {
    expect(mapUtmToChannel(source, medium)).toBe(expected);
  });

  it("is case-insensitive", () => {
    expect(mapUtmToChannel("GOOGLE", "CPC")).toBe("paid_search");
    expect(mapUtmToChannel("FaceBook", null)).toBe("social");
  });

  it("prioritizes paid medium over an organic-looking source", () => {
    expect(mapUtmToChannel("google", "cpc")).toBe("paid_search");
  });
});
