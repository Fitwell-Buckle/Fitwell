import { describe, it, expect } from "vitest";
import { toCents } from "@/lib/shopify/client";

describe("toCents", () => {
  it("converts a Shopify decimal string to integer cents", () => {
    expect(toCents("49.95")).toBe(4995);
    expect(toCents("100")).toBe(10000);
    expect(toCents("12.3")).toBe(1230);
  });

  it("handles negative amounts (refunds/adjustments)", () => {
    expect(toCents("-5.50")).toBe(-550);
  });

  it("returns 0 for null, undefined, or empty input", () => {
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
    expect(toCents("")).toBe(0);
  });

  it("returns 0 for non-numeric input", () => {
    expect(toCents("abc")).toBe(0);
  });
});
