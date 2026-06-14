import { describe, it, expect } from "vitest";
import { normalizeOrderTags, hasSampleTag } from "./order-tags";

describe("normalizeOrderTags", () => {
  it("handles empty / null / undefined", () => {
    expect(normalizeOrderTags(null)).toEqual([]);
    expect(normalizeOrderTags(undefined)).toEqual([]);
    expect(normalizeOrderTags("")).toEqual([]);
    expect(normalizeOrderTags([])).toEqual([]);
  });
  it("splits a comma-separated string, trims + lowercases", () => {
    expect(normalizeOrderTags("VIP, Beta ,  Sample")).toEqual(["vip", "beta", "sample"]);
  });
  it("accepts an array", () => {
    expect(normalizeOrderTags(["Sample", " press "])).toEqual(["sample", "press"]);
  });
});

describe("hasSampleTag", () => {
  it("matches the exact sample tag (any case/whitespace, string or array)", () => {
    expect(hasSampleTag("sample")).toBe(true);
    expect(hasSampleTag(" Sample ")).toBe(true);
    expect(hasSampleTag("vip, sample, beta")).toBe(true);
    expect(hasSampleTag(["VIP", "SAMPLE"])).toBe(true);
  });
  it("does not match absent / plural / lookalike tags", () => {
    expect(hasSampleTag("")).toBe(false);
    expect(hasSampleTag(null)).toBe(false);
    expect(hasSampleTag("vip, beta")).toBe(false);
    expect(hasSampleTag("samples")).toBe(false); // plural must NOT match
    expect(hasSampleTag("sampler")).toBe(false);
  });
});
