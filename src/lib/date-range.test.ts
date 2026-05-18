import { describe, it, expect } from "vitest";
import { parseDateRange } from "@/lib/date-range";

describe("parseDateRange", () => {
  it("defaults to a ~30 day window with day granularity", () => {
    const r = parseDateRange({});
    const spanDays =
      (r.to.getTime() - r.from.getTime()) / (1000 * 60 * 60 * 24);
    expect(Math.round(spanDays)).toBe(30);
    expect(r.granularity).toBe("day");
    expect(r.label).toBe("Custom");
  });

  it("parses explicit from/to into Dates", () => {
    const r = parseDateRange({ from: "2026-01-01", to: "2026-03-01" });
    expect(r.from).toBeInstanceOf(Date);
    expect(r.to).toBeInstanceOf(Date);
    expect(r.from.getUTCFullYear()).toBe(2026);
  });

  it("auto-selects week granularity for 30–90 day spans", () => {
    // 2026-01-01 → 2026-03-01 = 59 days
    expect(
      parseDateRange({ from: "2026-01-01", to: "2026-03-01" }).granularity,
    ).toBe("week");
  });

  it("auto-selects month granularity for spans over 90 days", () => {
    // 2026-01-01 → 2026-06-01 = 151 days
    expect(
      parseDateRange({ from: "2026-01-01", to: "2026-06-01" }).granularity,
    ).toBe("month");
  });

  it("honors an explicit valid granularity param", () => {
    expect(
      parseDateRange({ from: "2026-01-01", to: "2026-01-05", g: "month" })
        .granularity,
    ).toBe("month");
  });

  it("ignores an invalid granularity param and falls back to span-based", () => {
    expect(
      parseDateRange({ from: "2026-01-01", to: "2026-01-05", g: "bogus" })
        .granularity,
    ).toBe("day");
  });
});
