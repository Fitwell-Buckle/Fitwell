import { describe, it, expect } from "vitest";
import {
  dashboardSettingsSchema,
  DEFAULT_RETURN_LABEL_COST_CENTS,
} from "./settings-schema";

describe("dashboardSettingsSchema", () => {
  it("accepts a valid cents value", () => {
    const r = dashboardSettingsSchema.parse({ returnLabelCostCents: 850 });
    expect(r.returnLabelCostCents).toBe(850);
  });

  it("accepts 0 (free returns)", () => {
    expect(
      dashboardSettingsSchema.parse({ returnLabelCostCents: 0 })
        .returnLabelCostCents,
    ).toBe(0);
  });

  it("rejects negative values", () => {
    expect(() =>
      dashboardSettingsSchema.parse({ returnLabelCostCents: -1 }),
    ).toThrow();
  });

  it("rejects non-integer cents", () => {
    expect(() =>
      dashboardSettingsSchema.parse({ returnLabelCostCents: 12.5 }),
    ).toThrow();
  });

  it("rejects absurdly large values (> $1,000)", () => {
    expect(() =>
      dashboardSettingsSchema.parse({ returnLabelCostCents: 100_001 }),
    ).toThrow();
  });

  it("allows an empty patch (field optional)", () => {
    expect(dashboardSettingsSchema.parse({})).toEqual({});
  });
});

describe("DEFAULT_RETURN_LABEL_COST_CENTS", () => {
  it("matches the schema default of $7.00", () => {
    expect(DEFAULT_RETURN_LABEL_COST_CENTS).toBe(700);
  });
});
