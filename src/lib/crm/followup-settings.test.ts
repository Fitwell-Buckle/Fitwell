import { describe, expect, it } from "vitest";
import { followupSettingsSchema } from "./followup-settings-schema";

describe("followupSettingsSchema", () => {
  it("accepts a valid enabled + days payload", () => {
    expect(followupSettingsSchema.parse({ enabled: true, nudgeAfterDays: 14 })).toEqual({
      enabled: true,
      nudgeAfterDays: 14,
    });
  });

  it("allows partial updates (either field alone)", () => {
    expect(followupSettingsSchema.parse({ enabled: false })).toEqual({
      enabled: false,
    });
    expect(followupSettingsSchema.parse({ nudgeAfterDays: 30 })).toEqual({
      nudgeAfterDays: 30,
    });
  });

  it("rejects zero / negative / non-integer / over-cap days", () => {
    expect(() => followupSettingsSchema.parse({ nudgeAfterDays: 0 })).toThrow();
    expect(() => followupSettingsSchema.parse({ nudgeAfterDays: -5 })).toThrow();
    expect(() => followupSettingsSchema.parse({ nudgeAfterDays: 3.5 })).toThrow();
    expect(() =>
      followupSettingsSchema.parse({ nudgeAfterDays: 400 }),
    ).toThrow();
  });
});
