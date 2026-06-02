import { describe, it, expect } from "vitest";
import { classifyFlowName } from "./classify";

describe("classifyFlowName", () => {
  it.each([
    ["Welcome Flow", "welcome"],
    ["welcome series v2", "welcome"],
    ["Post-Purchase", "post_purchase"],
    ["post purchase outfitting", "post_purchase"],
    ["Thank you series", "post_purchase"],
    ["Outfit your collection", "post_purchase"],
    ["Win-back 90d", "other"],
    ["Abandoned Cart", "other"],
    ["", "other"],
  ])("classifies %j → %s", (name, expected) => {
    expect(classifyFlowName(name)).toBe(expected);
  });

  it("handles null gracefully", () => {
    expect(classifyFlowName(null)).toBe("other");
  });
});
