import { describe, expect, it } from "vitest";
import {
  leadDisplayName,
  personaLabel,
  sourceChannelLabel,
  splitFullName,
  stageBadgeClass,
  stageLabel,
  statusBadgeClass,
} from "@/lib/crm/display";

describe("stageLabel", () => {
  it("returns a human label for every known stage", () => {
    expect(stageLabel("lead")).toBe("Lead");
    expect(stageLabel("sample")).toBe("Sample");
    expect(stageLabel("customer")).toBe("Customer");
  });

  it("falls back to the raw key for unknown stages", () => {
    expect(stageLabel("totally_made_up")).toBe("totally_made_up");
  });
});

describe("stageBadgeClass", () => {
  it("returns distinct classes per known stage", () => {
    const classes = ["lead", "sample", "customer"].map(stageBadgeClass);
    expect(new Set(classes).size).toBe(classes.length);
  });

  it("falls back to a neutral class for unknown stages", () => {
    expect(stageBadgeClass("ghost")).toContain("zinc");
  });
});

describe("sourceChannelLabel", () => {
  it("maps all 7 B2B channels to human strings", () => {
    expect(sourceChannelLabel("b2b_trade_shows_consumer")).toBe("Tradeshow");
    expect(sourceChannelLabel("b2b_trade_shows_industry")).toBe(
      "Tradeshow (industry)",
    );
    expect(sourceChannelLabel("b2b_outbound_cold")).toBe("Outbound (cold)");
    expect(sourceChannelLabel("b2b_d2c_reverse_attribution")).toBe(
      "D2C reverse-attribution",
    );
  });

  it("falls back to the raw key for unknown channels", () => {
    expect(sourceChannelLabel("b2b_carrier_pigeon")).toBe("b2b_carrier_pigeon");
  });
});

describe("personaLabel", () => {
  it("returns a friendly label for each buyer-type tag", () => {
    expect(personaLabel("watch_oem")).toBe("Watch OEM");
    expect(personaLabel("strap_oem")).toBe("Strap OEM");
    expect(personaLabel("retailer")).toBe("Retailer");
    expect(personaLabel("distributor")).toBe("Distributor");
  });

  it("falls back to the raw key for unknown personas", () => {
    expect(personaLabel("B99")).toBe("B99");
  });
});

describe("statusBadgeClass", () => {
  it("maps each known status to a distinct class", () => {
    const a = statusBadgeClass("active");
    const c = statusBadgeClass("converted");
    const d = statusBadgeClass("dropped");
    expect(new Set([a, c, d]).size).toBe(3);
  });

  it("falls back to neutral for unknown status", () => {
    expect(statusBadgeClass("mystery")).toContain("zinc");
  });
});

describe("leadDisplayName", () => {
  it("prefers full name when both parts are present", () => {
    expect(
      leadDisplayName({ firstName: "Ada", lastName: "Lovelace" }),
    ).toBe("Ada Lovelace");
  });

  it("handles missing last name", () => {
    expect(leadDisplayName({ firstName: "Ada", lastName: null })).toBe("Ada");
  });

  it("falls back to companyName when no person name is set", () => {
    expect(
      leadDisplayName({
        firstName: null,
        lastName: null,
        companyName: "Analytical Engines",
      }),
    ).toBe("Analytical Engines");
  });

  it("falls back to email when nothing else is set", () => {
    expect(
      leadDisplayName({
        firstName: null,
        lastName: null,
        companyName: null,
        email: "ada@x.test",
      }),
    ).toBe("ada@x.test");
  });

  it("returns 'Unknown' when no identity fields are present", () => {
    expect(leadDisplayName({})).toBe("Unknown");
  });
});

describe("splitFullName", () => {
  it("splits first + last", () => {
    expect(splitFullName("Ada Lovelace")).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("keeps multi-word surnames on the last name", () => {
    expect(splitFullName("Mary Jane Watson")).toEqual({
      firstName: "Mary",
      lastName: "Jane Watson",
    });
  });

  it("fills only first name for a single token", () => {
    expect(splitFullName("Madonna")).toEqual({
      firstName: "Madonna",
      lastName: "",
    });
  });

  it("handles the 'Last, First' address-book form", () => {
    expect(splitFullName("Smith, John")).toEqual({
      firstName: "John",
      lastName: "Smith",
    });
  });

  it("collapses extra whitespace", () => {
    expect(splitFullName("  Ada   Lovelace  ")).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("returns empty strings for null/blank", () => {
    expect(splitFullName(null)).toEqual({ firstName: "", lastName: "" });
    expect(splitFullName("   ")).toEqual({ firstName: "", lastName: "" });
  });
});
