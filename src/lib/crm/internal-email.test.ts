import { describe, expect, it } from "vitest";
import { buildInternalEmailMatcher } from "./internal-email";

const isInternal = buildInternalEmailMatcher([
  "oliver@fitwellbuckle.co",
  "Tom <tom@fitwellbuckle.co>".replace(/.*<|>.*/g, ""), // tom@fitwellbuckle.co
  "ADMIN@fitwellbuckle.co",
  "",
  null,
]);

describe("buildInternalEmailMatcher", () => {
  it("flags a seeded address (case-insensitive)", () => {
    expect(isInternal("OLIVER@fitwellbuckle.co")).toBe(true);
  });
  it("flags anyone on a seeded domain, even if not seeded", () => {
    expect(isInternal("greg@fitwellbuckle.co")).toBe(true);
  });
  it("does NOT flag an external customer", () => {
    expect(isInternal("james@wisstraps.com")).toBe(false);
    expect(isInternal("jane@gmail.com")).toBe(false);
  });
  it("returns false for junk / empty", () => {
    expect(isInternal(null)).toBe(false);
    expect(isInternal("")).toBe(false);
    expect(isInternal("not-an-email")).toBe(false);
  });
  it("is empty-safe when there are no seeds", () => {
    const none = buildInternalEmailMatcher([]);
    expect(none("anyone@anywhere.com")).toBe(false);
  });
});
