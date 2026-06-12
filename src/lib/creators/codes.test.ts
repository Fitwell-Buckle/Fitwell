import { describe, expect, it } from "vitest";
import { defaultCreatorCode, normalizeCode } from "./codes";

describe("defaultCreatorCode", () => {
  it("uppercases and strips non-alphanumerics", () => {
    expect(defaultCreatorCode("watch.henry", 15)).toBe("WATCHHENRY15");
    expect(defaultCreatorCode("edc_mia-2", 15)).toBe("EDCMIA215");
  });

  it("truncates long handles to stay typeable", () => {
    const code = defaultCreatorCode("a".repeat(40), 15);
    expect(code).toBe(`${"A".repeat(18)}15`);
  });

  it("falls back when the handle has no usable characters", () => {
    expect(defaultCreatorCode("___", 20)).toBe("CREATOR20");
  });
});

describe("normalizeCode", () => {
  it("lowercases and trims (matches order_discount_code.code)", () => {
    expect(normalizeCode("  WATCHHENRY15 ")).toBe("watchhenry15");
  });
});
