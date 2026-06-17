import { describe, expect, it } from "vitest";
import {
  creatorSignupSchema,
  normalizeDomain,
  normalizeSignupProfiles,
  signupPlatformLabel,
  SIGNUP_PLATFORM_VALUES,
} from "./signup";

describe("normalizeDomain", () => {
  it("strips protocol, www, path and whitespace", () => {
    expect(normalizeDomain("https://www.twitch.tv/streamer")).toBe("twitch.tv");
    expect(normalizeDomain("  Twitch.TV ")).toBe("twitch.tv");
    expect(normalizeDomain("http://patreon.com/")).toBe("patreon.com");
  });
  it("returns empty for blank input", () => {
    expect(normalizeDomain("")).toBe("");
    expect(normalizeDomain(null)).toBe("");
  });
});

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

  it("resolves 'other' to the typed name + builds a profile URL from the domain", () => {
    const out = normalizeSignupProfiles([
      {
        platform: "other",
        platformName: "Twitch",
        platformDomain: "https://www.twitch.tv/",
        handle: "@streamer",
      },
    ]);
    expect(out).toEqual([
      {
        platform: "twitch",
        handle: "streamer",
        profileUrl: "https://twitch.tv/streamer",
      },
    ]);
  });

  it("dedupes two 'other' rows that resolve to the same platform", () => {
    const out = normalizeSignupProfiles([
      { platform: "other", platformName: "Twitch", platformDomain: "twitch.tv", handle: "me" },
      { platform: "other", platformName: "twitch", platformDomain: "twitch.tv", handle: "me" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].platform).toBe("twitch");
  });
});

describe("creatorSignupSchema", () => {
  const valid = {
    name: "Watch Guy",
    email: "guy@example.com",
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

  it("rejects a malformed email", () => {
    expect(
      creatorSignupSchema.safeParse({ ...valid, email: "nope" }).success,
    ).toBe(false);
  });

  it("requires a contact method: rejects when email and phone are both empty", () => {
    expect(
      creatorSignupSchema.safeParse({ ...valid, email: "" }).success,
    ).toBe(false);
  });

  it("accepts phone-only (no email)", () => {
    expect(
      creatorSignupSchema.safeParse({ ...valid, email: "", phone: "+1 555-0100" })
        .success,
    ).toBe(true);
  });

  it("accepts a filled honeypot at the schema layer (route drops it)", () => {
    // Honeypot enforcement lives in the route, not the schema, so a bot's
    // submission parses cleanly and is then silently discarded with a 201.
    const r = creatorSignupSchema.safeParse({ ...valid, website: "spam" });
    expect(r.success).toBe(true);
  });

  it("rejects 'other' without a platform name", () => {
    const r = creatorSignupSchema.safeParse({
      ...valid,
      profiles: [{ platform: "other", platformDomain: "twitch.tv", handle: "@x" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects 'other' without a domain", () => {
    const r = creatorSignupSchema.safeParse({
      ...valid,
      profiles: [{ platform: "other", platformName: "Twitch", handle: "@x" }],
    });
    expect(r.success).toBe(false);
  });

  it("accepts 'other' with a platform name and domain", () => {
    const r = creatorSignupSchema.safeParse({
      ...valid,
      profiles: [
        {
          platform: "other",
          platformName: "Twitch",
          platformDomain: "twitch.tv",
          handle: "@x",
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("exposes the platform enum to the form", () => {
    expect(SIGNUP_PLATFORM_VALUES).toContain("ig");
    expect(SIGNUP_PLATFORM_VALUES).toContain("yt");
  });
});

describe("signupPlatformLabel", () => {
  it("labels known platforms and passes through custom ones", () => {
    expect(signupPlatformLabel("ig")).toBe("Instagram");
    expect(signupPlatformLabel("yt")).toBe("YouTube");
    expect(signupPlatformLabel("twitch")).toBe("twitch");
  });
});
