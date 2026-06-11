import { describe, it, expect } from "vitest";
import {
  elapsedPct,
  dueThresholds,
  shouldEscalate,
  MS_PER_DAY,
} from "./stage-checkin";

const now = Date.parse("2026-06-11T00:00:00Z");

describe("elapsedPct", () => {
  it("is 50% halfway through a 10-day estimate", () => {
    const entered = now - 5 * MS_PER_DAY;
    expect(elapsedPct(entered, 10, now)).toBe(50);
  });
  it("exceeds 100 when overrun", () => {
    const entered = now - 12 * MS_PER_DAY;
    expect(elapsedPct(entered, 10, now)).toBeGreaterThan(100);
  });
  it("is 0 for a non-positive estimate (no clock)", () => {
    expect(elapsedPct(now, 0, now)).toBe(0);
  });
});

describe("dueThresholds", () => {
  const thresholds = [50, 75, 95];
  it("fires only crossed, unsent thresholds", () => {
    expect(dueThresholds(60, thresholds, [])).toEqual([50]);
    expect(dueThresholds(80, thresholds, [50])).toEqual([75]);
    expect(dueThresholds(99, thresholds, [50, 75])).toEqual([95]);
  });
  it("fires multiple at once when several are newly crossed", () => {
    expect(dueThresholds(99, thresholds, [])).toEqual([50, 75, 95]);
  });
  it("fires nothing before the first threshold", () => {
    expect(dueThresholds(40, thresholds, [])).toEqual([]);
  });
  it("fires nothing when all already sent", () => {
    expect(dueThresholds(99, thresholds, [50, 75, 95])).toEqual([]);
  });
});

describe("shouldEscalate", () => {
  it("escalates a flagged delay", () => {
    expect(shouldEscalate(["pending", "at_risk"], 60)).toBe(true);
  });
  it("escalates an overrun with no on-track confirmation", () => {
    expect(shouldEscalate(["pending"], 105)).toBe(true);
  });
  it("does NOT escalate an overrun once confirmed on track", () => {
    expect(shouldEscalate(["on_track"], 110)).toBe(false);
  });
  it("does NOT escalate before overrun when no delay flagged", () => {
    expect(shouldEscalate(["pending"], 80)).toBe(false);
  });
});
