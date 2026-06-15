import { describe, it, expect } from "vitest";
import {
  computeRepeatWindows,
  REPEAT_WINDOWS,
  type RepeatTiming,
} from "./repeat-windows";

const DAY_MS = 24 * 60 * 60 * 1000;
// Arbitrary fixed "first order" anchor so gaps are deterministic.
const FIRST = new Date("2026-01-01T00:00:00Z").getTime();

/** A newly-acquired customer whose 2nd in-period order is `gapDays` later (or none). */
function acquired(gapDays: number | null): RepeatTiming {
  return {
    newlyAcquired: true,
    firstOrderMs: FIRST,
    secondOrderMs: gapDays == null ? null : FIRST + gapDays * DAY_MS,
  };
}

/** A pre-existing customer (first-ever order predates the range) — must be excluded. */
function preExisting(gapDays: number | null): RepeatTiming {
  return { ...acquired(gapDays), newlyAcquired: false };
}

const rate = (s: ReturnType<typeof computeRepeatWindows>, key: string) =>
  s.cells.find((c) => c.key === key)!.rate;

describe("computeRepeatWindows — newly-acquired cohort", () => {
  it("denominator counts only newly-acquired customers", () => {
    const s = computeRepeatWindows(
      [acquired(10), acquired(null), preExisting(5), preExisting(null)],
      400,
    );
    expect(s.cohort).toBe(2); // both pre-existing customers excluded
  });

  it("excludes a customer who bought before the window and again within it", () => {
    // The headline case from the spec: pre-window first purchase ⇒ doesn't count,
    // even though they repeated inside the period.
    const s = computeRepeatWindows([preExisting(20)], 400);
    expect(s.cohort).toBe(0);
    expect(rate(s, "d30")).toBeNull(); // empty cohort
  });

  it("rates are the share of the cohort, monotonically non-decreasing", () => {
    const customers = [
      acquired(15),
      acquired(80),
      acquired(150),
      acquired(300),
      acquired(null),
    ];
    const s = computeRepeatWindows(customers, 400);
    expect(s.cohort).toBe(5);
    expect(rate(s, "d30")).toBe(20); // 1/5
    expect(rate(s, "d90")).toBe(40); // 2/5
    expect(rate(s, "m6")).toBe(60); // 3/5 (≤182d)
    expect(rate(s, "y1")).toBe(80); // 4/5 (≤365d)
    const rates = REPEAT_WINDOWS.map((w) => rate(s, w.key) ?? 0);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThanOrEqual(rates[i - 1]);
    }
  });

  it("a one-and-done newly-acquired customer is in the denominator but never a repeat", () => {
    const s = computeRepeatWindows([acquired(null)], 400);
    expect(s.cohort).toBe(1);
    expect(rate(s, "y1")).toBe(0);
  });

  it("counts a repeat exactly on the window boundary", () => {
    const s = computeRepeatWindows([acquired(90)], 400);
    expect(rate(s, "d90")).toBe(100);
    expect(rate(s, "d30")).toBe(0);
  });
});

describe("computeRepeatWindows — windows wider than the range collapse", () => {
  it("shows columns only up to the window that covers the range", () => {
    // ~100-day range → ≤6mo (182d) is the narrowest window covering it, so it
    // carries the period total; ≤1yr would just duplicate it, so renders —.
    const s = computeRepeatWindows([acquired(20), acquired(95)], 100);
    expect(s.cells.find((c) => c.key === "d30")!.supported).toBe(true);
    expect(s.cells.find((c) => c.key === "d90")!.supported).toBe(true);
    expect(s.cells.find((c) => c.key === "m6")!.supported).toBe(true);
    expect(s.cells.find((c) => c.key === "y1")!.supported).toBe(false);
    expect(rate(s, "m6")).toBe(100); // both customers repeated in period
    expect(rate(s, "y1")).toBeNull();
  });

  it("the covering window carries the full period-repeat total", () => {
    // 60-day range: ≤90d is the covering window and equals 'repeated in period'.
    const s = computeRepeatWindows([acquired(45), acquired(null)], 60);
    expect(s.cells.find((c) => c.key === "d90")!.supported).toBe(true);
    expect(rate(s, "d90")).toBe(50); // 1 of 2 repeated in period
    expect(rate(s, "m6")).toBeNull();
  });

  it("shows all four windows when the range exceeds the widest window", () => {
    const s = computeRepeatWindows([acquired(400)], 500);
    expect(s.cells.every((c) => c.supported)).toBe(true);
    // gap 400d is beyond ≤1yr, so even ≤1yr is 0 here.
    expect(rate(s, "y1")).toBe(0);
  });
});
