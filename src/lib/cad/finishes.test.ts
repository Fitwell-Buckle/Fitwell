import { describe, it, expect } from "vitest";
import { matchFinish, FINISHES, DEFAULT_FINISH_ID } from "./finishes";

describe("matchFinish", () => {
  const cases: [string, string | null][] = [
    ["Natural (silver)", "silver_steel"],
    ["316L Stainless Steel", "silver_steel"],
    ["Silver Steel", "silver_steel"],
    ["Black", "black_steel"],
    ["Black Steel", "black_steel"],
    ["Yellow Gold Steel", "yellow_gold_steel"],
    ["Gold", "yellow_gold_steel"],
    ["Rose Gold Steel", "rose_gold_steel"],
    ["Rose Gold", "rose_gold_steel"],
    ["Titanium", "titanium"],
    // Bead blasted / matte → the matte variant (steel + titanium only).
    ["Bead Blasted Titanium", "matte_titanium"],
    ["bead-blasted steel", "matte_steel"],
    ["Matte Steel", "matte_steel"],
    // No match.
    ["Carbon Fiber", null],
    ["", null],
  ];
  for (const [input, expected] of cases) {
    it(`"${input}" → ${expected ?? "null"}`, () => {
      expect(matchFinish(input)?.id ?? null).toBe(expected);
    });
  }

  it("null/undefined → null", () => {
    expect(matchFinish(null)).toBeNull();
    expect(matchFinish(undefined)).toBeNull();
  });

  it("every finish id referenced is valid", () => {
    const ids = new Set(FINISHES.map((f) => f.id));
    expect(ids.has(DEFAULT_FINISH_ID)).toBe(true);
  });
});
