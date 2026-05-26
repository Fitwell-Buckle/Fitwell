import { describe, it, expect } from "vitest";
import {
  formatInfluencerOrderNumber,
  computeGiftTotals,
  deadlineStatus,
  DEADLINE_STATUS_ORDER,
} from "./influencer";

describe("formatInfluencerOrderNumber", () => {
  it("zero-pads with a GIFT- prefix", () => {
    expect(formatInfluencerOrderNumber(100)).toBe("GIFT-00100");
    expect(formatInfluencerOrderNumber(101)).toBe("GIFT-00101");
    expect(formatInfluencerOrderNumber(100000)).toBe("GIFT-100000");
  });
});

describe("computeGiftTotals", () => {
  it("100% off: subtotal is the retail gift value, total is zero", () => {
    const t = computeGiftTotals([
      { quantity: 2, unitPriceCents: 5000 }, // 10000
      { quantity: 1, unitPriceCents: 2500 }, // 2500
    ]);
    expect(t.subtotalCents).toBe(12500);
    expect(t.discountCents).toBe(12500);
    expect(t.totalCents).toBe(0);
  });

  it("handles an empty order", () => {
    expect(computeGiftTotals([])).toEqual({
      subtotalCents: 0,
      discountCents: 0,
      totalCents: 0,
    });
  });
});

describe("deadlineStatus", () => {
  const today = "2026-05-25";

  it("returns no_deadline when no due date is set", () => {
    expect(
      deadlineStatus({ contentDueDate: null, publishedAt: null, today }),
    ).toBe("no_deadline");
  });

  it("hit: published on or before the due date", () => {
    expect(
      deadlineStatus({
        contentDueDate: "2026-05-30",
        publishedAt: "2026-05-28",
        today,
      }),
    ).toBe("hit");
    expect(
      deadlineStatus({
        contentDueDate: "2026-05-30",
        publishedAt: "2026-05-30",
        today,
      }),
    ).toBe("hit");
  });

  it("hit: published with no due date set is still a hit", () => {
    expect(
      deadlineStatus({ contentDueDate: null, publishedAt: "2026-05-20", today }),
    ).toBe("hit");
  });

  it("missed: published after the due date", () => {
    expect(
      deadlineStatus({
        contentDueDate: "2026-05-20",
        publishedAt: "2026-05-24",
        today,
      }),
    ).toBe("missed");
  });

  it("missed: not published and the due date has passed", () => {
    expect(
      deadlineStatus({ contentDueDate: "2026-05-24", publishedAt: null, today }),
    ).toBe("missed");
  });

  it("approaching: due today or within the default 7-day window", () => {
    expect(
      deadlineStatus({ contentDueDate: "2026-05-25", publishedAt: null, today }),
    ).toBe("approaching");
    expect(
      deadlineStatus({ contentDueDate: "2026-06-01", publishedAt: null, today }),
    ).toBe("approaching");
  });

  it("on_track: due further out than the approaching window", () => {
    expect(
      deadlineStatus({ contentDueDate: "2026-06-10", publishedAt: null, today }),
    ).toBe("on_track");
  });

  it("respects a custom approachingDays window", () => {
    expect(
      deadlineStatus({
        contentDueDate: "2026-06-10",
        publishedAt: null,
        today,
        approachingDays: 30,
      }),
    ).toBe("approaching");
  });

  it("orders most-urgent first", () => {
    const order = [...["hit", "no_deadline", "missed", "on_track", "approaching"]].sort(
      (a, b) =>
        DEADLINE_STATUS_ORDER[a as keyof typeof DEADLINE_STATUS_ORDER] -
        DEADLINE_STATUS_ORDER[b as keyof typeof DEADLINE_STATUS_ORDER],
    );
    expect(order).toEqual(["missed", "approaching", "on_track", "hit", "no_deadline"]);
  });
});
