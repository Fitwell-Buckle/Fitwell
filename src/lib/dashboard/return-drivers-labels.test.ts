import { describe, it, expect } from "vitest";
import { parseRd, rdParam, RD_DIMS } from "./return-drivers-labels";

describe("rdParam / parseRd round-trip", () => {
  it("round-trips simple values", () => {
    expect(parseRd(rdParam("country", "US"))).toEqual({
      dim: "country",
      value: "US",
    });
  });

  it("round-trips values containing spaces, slashes and unicode", () => {
    for (const v of ["M4 Universal Link", "Facebook/Meta", "≤ 7 days", "Late night (10–5)", "4+ products"]) {
      expect(parseRd(rdParam("source", v))).toEqual({ dim: "source", value: v });
    }
  });

  it("preserves a value that itself contains the separator after the first one", () => {
    // split on the FIRST pipe only
    expect(parseRd("family|a|b")).toEqual({ dim: "family", value: "a|b" });
  });

  it("rejects unknown dimensions", () => {
    expect(parseRd("bogus|x")).toBeNull();
  });

  it("rejects malformed / empty input", () => {
    expect(parseRd(undefined)).toBeNull();
    expect(parseRd("")).toBeNull();
    expect(parseRd("country")).toBeNull(); // no separator
    expect(parseRd("|US")).toBeNull(); // empty dim
    expect(parseRd("country|")).toBeNull(); // empty value
    expect(parseRd(["country|US"])).toBeNull(); // array param
  });

  it("every RD_DIM round-trips", () => {
    for (const d of RD_DIMS) {
      expect(parseRd(rdParam(d, "x"))).toEqual({ dim: d, value: "x" });
    }
  });
});
