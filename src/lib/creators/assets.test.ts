import { describe, expect, it } from "vitest";
import { rightsExpiresAt, rightsStatus } from "./assets";

const RECEIVED = new Date("2026-06-01T00:00:00Z");

describe("rightsExpiresAt", () => {
  it("paid tiers expire 30/90 days from receipt", () => {
    expect(rightsExpiresAt("paid_30d", RECEIVED)?.toISOString().slice(0, 10)).toBe(
      "2026-07-01",
    );
    expect(rightsExpiresAt("paid_90d", RECEIVED)?.toISOString().slice(0, 10)).toBe(
      "2026-08-30",
    );
  });

  it("organic-only and perpetual never expire", () => {
    expect(rightsExpiresAt("organic_only", RECEIVED)).toBeNull();
    expect(rightsExpiresAt("perpetual", RECEIVED)).toBeNull();
  });
});

describe("rightsStatus", () => {
  const expiry = new Date("2026-07-01T00:00:00Z");

  it("organic_only is its own state regardless of dates", () => {
    expect(rightsStatus("organic_only", null)).toBe("organic_only");
  });

  it("perpetual is always active", () => {
    expect(rightsStatus("perpetual", null, new Date("2030-01-01"))).toBe("active");
  });

  it("active until 14 days before expiry", () => {
    expect(rightsStatus("paid_30d", expiry, new Date("2026-06-10"))).toBe("active");
    expect(rightsStatus("paid_30d", expiry, new Date("2026-06-17"))).toBe(
      "expiring_soon",
    );
    expect(rightsStatus("paid_30d", expiry, new Date("2026-06-30"))).toBe(
      "expiring_soon",
    );
  });

  it("expired at and after expiry", () => {
    expect(rightsStatus("paid_30d", expiry, new Date("2026-07-01"))).toBe("expired");
    expect(rightsStatus("paid_30d", expiry, new Date("2026-08-01"))).toBe("expired");
  });
});
