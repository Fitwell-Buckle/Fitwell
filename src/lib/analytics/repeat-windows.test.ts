import { describe, it, expect } from "vitest";
import {
  anchorWindowDays,
  computeRepeatWindows,
  REPEAT_WINDOWS,
  type RepeatTiming,
} from "./repeat-windows";

const DAY_MS = 24 * 60 * 60 * 1000;
// Fixed "end of range" so tests are deterministic.
const TO = new Date("2026-06-14T00:00:00Z").getTime();

/** A customer whose first order was `ageDays` before TO, repeating after `gapDays` (or never). */
function customer(ageDays: number, gapDays: number | null): RepeatTiming {
  const firstOrderMs = TO - ageDays * DAY_MS;
  return {
    firstOrderMs,
    secondOrderMs: gapDays == null ? null : firstOrderMs + gapDays * DAY_MS,
  };
}

const rate = (s: ReturnType<typeof computeRepeatWindows>, key: string) =>
  s.cells.find((c) => c.key === key)!.rate;

describe("anchorWindowDays", () => {
  it("picks the widest window that fits inside the range", () => {
    expect(anchorWindowDays(378)).toBe(365); // >1yr range → 1yr anchor
    expect(anchorWindowDays(200)).toBe(182); // ~6.5mo → 6mo anchor
    expect(anchorWindowDays(100)).toBe(90);
    expect(anchorWindowDays(45)).toBe(30);
  });

  it("returns 0 when the range is shorter than the narrowest window", () => {
    expect(anchorWindowDays(20)).toBe(0);
  });
});

describe("computeRepeatWindows — shared denominator", () => {
  it("uses one cohort for every supported column (same eligible count)", () => {
    // Range > 1yr → anchor 365. Only customers observed ≥365d are in cohort.
    const customers = [
      customer(400, 20), // in cohort, repeats fast
      customer(400, 200), // in cohort, repeats at ~6mo
      customer(370, null), // in cohort, never repeats
      customer(100, 10), // observed <365d → excluded from the shared cohort
    ];
    const s = computeRepeatWindows(customers, TO, 378);
    expect(s.anchorDays).toBe(365);
    expect(s.cohort).toBe(3); // the <365d customer is excluded everywhere
  });

  it("rates are monotonically non-decreasing across columns", () => {
    const customers = [
      customer(400, 15),
      customer(400, 80),
      customer(400, 150),
      customer(400, 300),
      customer(400, null),
      customer(380, 40),
    ];
    const s = computeRepeatWindows(customers, TO, 378);
    const rates = REPEAT_WINDOWS.map((w) => rate(s, w.key) ?? 0);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThanOrEqual(rates[i - 1]);
    }
  });

  it("fixes the anomaly: shared cohort cannot show fewer repeats at 6mo than 90d", () => {
    // The old per-window scheme would put the fast repeater in the 90d cohort
    // but a different (older) set in the 6mo cohort, allowing 6mo < 90d. With a
    // shared cohort, the 90d repeater is also counted in 6mo by construction.
    const customers = [
      customer(400, 60), // repeats within 90d → also within 6mo and 1yr
      customer(400, null), // never repeats
    ];
    const s = computeRepeatWindows(customers, TO, 378);
    expect(rate(s, "d90")).toBe(50);
    expect(rate(s, "m6")).toBeGreaterThanOrEqual(rate(s, "d90")!);
    expect(rate(s, "m6")).toBe(50);
    expect(rate(s, "y1")).toBe(50);
  });
});

describe("computeRepeatWindows — windows wider than the range", () => {
  it("reports null (—) for windows the range can't observe", () => {
    // ~100d range → anchor 90. 6mo and 1yr are unsupported.
    const s = computeRepeatWindows([customer(95, 20)], TO, 100);
    expect(s.anchorDays).toBe(90);
    expect(rate(s, "d30")).not.toBeNull();
    expect(rate(s, "d90")).not.toBeNull();
    expect(s.cells.find((c) => c.key === "m6")!.supported).toBe(false);
    expect(rate(s, "m6")).toBeNull();
    expect(rate(s, "y1")).toBeNull();
  });

  it("returns an all-null table when the range is too short for any window", () => {
    const s = computeRepeatWindows([customer(10, 5)], TO, 20);
    expect(s.anchorDays).toBe(0);
    expect(s.cohort).toBe(0);
    expect(s.cells.every((c) => c.rate === null && !c.supported)).toBe(true);
  });
});

describe("computeRepeatWindows — edge cases", () => {
  it("skips customers with no first order and empty cohorts yield null rates", () => {
    const s = computeRepeatWindows(
      [{ firstOrderMs: null, secondOrderMs: null }],
      TO,
      378,
    );
    expect(s.cohort).toBe(0);
    expect(s.cells.every((c) => c.rate === null)).toBe(true);
  });

  it("counts a repeat exactly on the window boundary as repeated", () => {
    const s = computeRepeatWindows([customer(400, 90)], TO, 378);
    expect(rate(s, "d90")).toBe(100);
  });
});
