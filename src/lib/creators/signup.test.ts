import { describe, expect, it } from "vitest";
import {
  creatorSignupSchema,
  normalizeSignupProfiles,
  SIGNUP_PLATFORM_VALUES,
} from "./signup";

describe("normalizeSignupProfiles", () => {
  it("strips @ and lowercases handles", () => {
    const out = normalizeSignupProfiles([
      { platform: "ig", handle: "  @Maker.Minute " },
    ]);
    expect(out).toEqual([
      { platform: "ig", handle: "maker.minute", profileUrl: null },
    ]);
  });

  it("dedupes identical platform+handle pairs, first wins", () => {
    const out = normalizeSignupProfiles([
      { platform: "ig", handle: "@watchguy" },
      { platform: "ig", handle: "watchguy" },
      { platform: "yt", handle: "watchguy" },
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((p) => `${p.platform}:${p.handle}`)).toEqual([
      "ig:watchguy",
      "yt:watchguy",
    ]);
  });

  it("drops rows whose handle normalizes to empty", () => {
    const out = normalizeSignupProfiles([
      { platform: "ig", handle: "@@@" },
      { platform: "yt", handle: "real" },
    ]);
    expect(out).toEqual([
      { platform: "yt", handle: "real", profileUrl: null },
    ]);
  });

  it("keeps a profile per distinct platform", () => {
    const out = normalizeSignupProfiles([
      { platform: "ig", handle: "a" },
      { platform: "tt", handle: "a" },
      { platform: "yt", handle: "a" },
    ]);
    expect(out).toHaveLength(3);
  });
});

describe("creatorSignupSchema", () => {
  const valid = {
    name: "Watch Guy",
    profiles: [{ platform: "ig", handle: "@watchguy" }],
  };

  it("accepts a minimal valid submission", () => {
    expect(creatorSignupSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty name", () => {
    const r = creatorSignupSchema.safeParse({ ...valid, name: "  " });
    expect(r.success).toBe(false);
  });

  it("requires at least one profile", () => {
    const r = creatorSignupSchema.safeParse({ ...valid, profiles: [] });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown platform", () => {
    const r = creatorSignupSchema.safeParse({
      ...valid,
      profiles: [{ platform: "myspace", handle: "x" }],
    });
    expect(r.success).toBe(false);
  });

  it("allows a blank email but rejects a malformed one", () => {
    expect(
      creatorSignupSchema.safeParse({ ...valid, email: "" }).success,
    ).toBe(true);
    expect(
      creatorSignupSchema.safeParse({ ...valid, email: "nope" }).success,
    ).toBe(false);
  });

  it("accepts a filled honeypot at the schema layer (route drops it)", () => {
    // Honeypot enforcement lives in the route, not the schema, so a bot's
    // submission parses cleanly and is then silently discarded with a 201.
    const r = creatorSignupSchema.safeParse({ ...valid, website: "spam" });
    expect(r.success).toBe(true);
  });

  it("exposes the platform enum to the form", () => {
    expect(SIGNUP_PLATFORM_VALUES).toContain("ig");
    expect(SIGNUP_PLATFORM_VALUES).toContain("yt");
  });
});
