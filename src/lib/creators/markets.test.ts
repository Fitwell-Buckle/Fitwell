import { describe, expect, it } from "vitest";
import { isOutOfMarket } from "./markets";

describe("isOutOfMarket", () => {
  const markets = new Set(["US", "CA", "GB"]);

  it("country outside active markets → out", () => {
    expect(isOutOfMarket("IN", markets)).toBe(true);
  });

  it("country inside active markets → in", () => {
    expect(isOutOfMarket("US", markets)).toBe(false);
    expect(isOutOfMarket("us", markets)).toBe(false); // case-insensitive
  });

  it("unknown country → in-market (never park on missing data)", () => {
    expect(isOutOfMarket(null, markets)).toBe(false);
  });

  it("markets lookup failed → fail open, everyone in-market", () => {
    expect(isOutOfMarket("IN", null)).toBe(false);
  });
});
