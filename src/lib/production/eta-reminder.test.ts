import { describe, it, expect } from "vitest";
import { isReminderDue, MS_PER_DAY } from "./eta-reminder";

const now = Date.parse("2026-06-11T15:00:00Z");

describe("isReminderDue", () => {
  it("is due when never reminded", () => {
    expect(isReminderDue(null, 2, now)).toBe(true);
    expect(isReminderDue(undefined, 2, now)).toBe(true);
  });

  it("is not due before the interval elapses", () => {
    const yesterday = new Date(now - 1 * MS_PER_DAY);
    expect(isReminderDue(yesterday, 2, now)).toBe(false);
  });

  it("is due exactly at the interval", () => {
    const twoDaysAgo = new Date(now - 2 * MS_PER_DAY);
    expect(isReminderDue(twoDaysAgo, 2, now)).toBe(true);
  });

  it("is due after the interval", () => {
    const fiveDaysAgo = new Date(now - 5 * MS_PER_DAY);
    expect(isReminderDue(fiveDaysAgo, 2, now)).toBe(true);
  });

  it("respects a changed interval", () => {
    const threeDaysAgo = new Date(now - 3 * MS_PER_DAY);
    expect(isReminderDue(threeDaysAgo, 7, now)).toBe(false); // weekly: not yet
    expect(isReminderDue(threeDaysAgo, 2, now)).toBe(true); // every-2-days: due
  });
});
