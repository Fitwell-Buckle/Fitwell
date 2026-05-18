import { describe, it, expect } from "vitest";
import {
  dateToBucketKey,
  generateBucketKeys,
  formatBucketLabel,
  formatCurrency,
  formatNumber,
} from "@/lib/chart-utils";

describe("dateToBucketKey", () => {
  const d = new Date(2026, 4, 18); // local 2026-05-18

  it("day granularity → YYYY-MM-DD", () => {
    expect(dateToBucketKey(d, "day")).toBe("2026-05-18");
  });

  it("month granularity → YYYY-MM", () => {
    expect(dateToBucketKey(d, "month")).toBe("2026-05");
  });

  it("week granularity → YYYY-Www", () => {
    expect(dateToBucketKey(new Date(2026, 0, 1), "week")).toBe("2026-W01");
  });

  it("zero-pads month and day", () => {
    expect(dateToBucketKey(new Date(2026, 0, 5), "day")).toBe("2026-01-05");
  });
});

describe("generateBucketKeys", () => {
  it("enumerates consecutive days inclusively", () => {
    expect(
      generateBucketKeys(new Date(2026, 4, 1), new Date(2026, 4, 3), "day"),
    ).toEqual(["2026-05-01", "2026-05-02", "2026-05-03"]);
  });

  it("dedupes when many days collapse into one month bucket", () => {
    expect(
      generateBucketKeys(new Date(2026, 0, 15), new Date(2026, 2, 2), "month"),
    ).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("returns empty when from is after to", () => {
    expect(
      generateBucketKeys(new Date(2026, 4, 10), new Date(2026, 4, 1), "day"),
    ).toEqual([]);
  });

  it("returns a single bucket when from equals to", () => {
    expect(
      generateBucketKeys(new Date(2026, 4, 1), new Date(2026, 4, 1), "day"),
    ).toEqual(["2026-05-01"]);
  });
});

describe("formatBucketLabel", () => {
  it("returns the raw key for an unknown granularity", () => {
    expect(formatBucketLabel("raw-key", "quarter" as never)).toBe("raw-key");
  });

  it("produces a non-empty label for each known granularity", () => {
    expect(formatBucketLabel("2026-05-18", "day")).toBeTruthy();
    expect(formatBucketLabel("2026-W20", "week")).toBeTruthy();
    expect(formatBucketLabel("2026-05", "month")).toBeTruthy();
  });
});

describe("formatCurrency / formatNumber", () => {
  it("formats cents as USD", () => {
    expect(formatCurrency(4995)).toBe("$49.95");
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("groups large integers", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });
});
