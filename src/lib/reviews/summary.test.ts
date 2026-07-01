import { describe, it, expect, vi } from "vitest";

// summary.ts imports @/lib/db (which opens a Neon connection at module
// load). Stub it so this pure-logic test doesn't need a database.
vi.mock("@/lib/db", () => ({ db: {} }));

import { roundRating } from "./summary";

describe("roundRating", () => {
  it("rounds a numeric average to 1 decimal place", () => {
    expect(roundRating(4.62)).toBe(4.6);
    expect(roundRating(4.65)).toBe(4.7);
    expect(roundRating(5)).toBe(5);
  });

  it("coerces the numeric string Postgres avg() returns", () => {
    expect(roundRating("4.615384615")).toBe(4.6);
    expect(roundRating("0")).toBe(0);
  });

  it("returns 0 for null, undefined, or non-numeric input", () => {
    expect(roundRating(null)).toBe(0);
    expect(roundRating(undefined)).toBe(0);
    expect(roundRating("not-a-number")).toBe(0);
  });
});
