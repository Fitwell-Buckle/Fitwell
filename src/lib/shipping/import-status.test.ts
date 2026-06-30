import { describe, it, expect, vi } from "vitest";

// import-status.ts imports the live db for getShippingImportStatus; the pure
// helpers under test don't touch it.
vi.mock("@/lib/db", () => ({ db: {} }));

import {
  daysSince,
  isShippingImportStale,
  shouldSeeShippingReminder,
} from "./import-status";

const NOW = new Date("2026-06-30T12:00:00.000Z");

describe("daysSince", () => {
  it("returns null for a null date", () => {
    expect(daysSince(null, NOW)).toBeNull();
  });

  it("counts whole days elapsed", () => {
    expect(daysSince(new Date("2026-06-30T00:00:00.000Z"), NOW)).toBe(0);
    expect(daysSince(new Date("2026-06-29T00:00:00.000Z"), NOW)).toBe(1);
    expect(daysSince(new Date("2026-06-23T11:00:00.000Z"), NOW)).toBe(7);
  });
});

describe("isShippingImportStale", () => {
  it("is stale when never imported", () => {
    expect(isShippingImportStale(null)).toBe(true);
  });

  it("is stale at or past the window (default 7d), fresh before", () => {
    expect(isShippingImportStale(6)).toBe(false);
    expect(isShippingImportStale(7)).toBe(true);
    expect(isShippingImportStale(20)).toBe(true);
  });

  it("respects a custom window", () => {
    expect(isShippingImportStale(7, 14)).toBe(false);
    expect(isShippingImportStale(14, 14)).toBe(true);
  });
});

describe("shouldSeeShippingReminder", () => {
  it("shows only to the owner (Tom), case-insensitively", () => {
    expect(shouldSeeShippingReminder("tom@fitwellbuckle.co")).toBe(true);
    expect(shouldSeeShippingReminder("Tom@Fitwellbuckle.co")).toBe(true);
  });

  it("hides from other admins and missing emails", () => {
    expect(shouldSeeShippingReminder("oliver@fitwellbuckle.co")).toBe(false);
    expect(shouldSeeShippingReminder("greg@fitwellbuckle.co")).toBe(false);
    expect(shouldSeeShippingReminder(null)).toBe(false);
    expect(shouldSeeShippingReminder(undefined)).toBe(false);
    expect(shouldSeeShippingReminder("")).toBe(false);
  });
});
