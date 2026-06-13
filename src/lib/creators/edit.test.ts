import { describe, it, expect } from "vitest";
import {
  pickPrimaryPlatform,
  recomputeRollups,
  deriveNameFromHandle,
  flagPossibleMismatch,
} from "./edit";

describe("pickPrimaryPlatform", () => {
  it("returns null for no platforms", () => {
    expect(pickPrimaryPlatform([])).toBeNull();
  });

  it("returns the sole platform when only one remains (the split case)", () => {
    expect(
      pickPrimaryPlatform([{ platform: "ig", fitScore: 50, followers: 1000 }]),
    ).toBe("ig");
  });

  it("picks the highest-followers platform", () => {
    expect(
      pickPrimaryPlatform([
        { platform: "ig", fitScore: 80, followers: 5000 },
        { platform: "yt", fitScore: 40, followers: 90000 },
      ]),
    ).toBe("yt");
  });

  it("falls back to fit when followers tie/unknown", () => {
    expect(
      pickPrimaryPlatform([
        { platform: "ig", fitScore: 30, followers: null },
        { platform: "yt", fitScore: 70, followers: null },
      ]),
    ).toBe("yt");
  });

  it("is deterministic on a full tie (yt before ig)", () => {
    expect(
      pickPrimaryPlatform([
        { platform: "ig", fitScore: null, followers: null },
        { platform: "yt", fitScore: null, followers: null },
      ]),
    ).toBe("yt");
  });
});

describe("recomputeRollups", () => {
  it("zeroes out for an empty creator", () => {
    expect(recomputeRollups([])).toEqual({
      crossPlatformFit: null,
      primaryPlatform: null,
    });
  });

  it("uses the single fit score when one platform remains", () => {
    expect(
      recomputeRollups([{ platform: "ig", fitScore: 62.5, followers: 1000 }]),
    ).toEqual({ crossPlatformFit: 62.5, primaryPlatform: "ig" });
  });

  it("recomputes best + 0.2*next across platforms", () => {
    const r = recomputeRollups([
      { platform: "ig", fitScore: 80, followers: 1000 },
      { platform: "yt", fitScore: 40, followers: 5000 },
    ]);
    expect(r.crossPlatformFit).toBeCloseTo(80 + 0.2 * 40, 5);
    expect(r.primaryPlatform).toBe("yt");
  });
});

describe("deriveNameFromHandle", () => {
  it("humanises a handle", () => {
    expect(deriveNameFromHandle("@The1916Company", "yt")).toBe(
      "@the1916company (yt)",
    );
  });
  it("falls back when handle is empty", () => {
    expect(deriveNameFromHandle("", "ig")).toBe("Untitled ig creator");
  });
});

describe("flagPossibleMismatch", () => {
  it("never flags a single-platform creator", () => {
    expect(
      flagPossibleMismatch("The Watch Couple", [
        { platform: "ig", handle: "thewatchcouple" },
      ]),
    ).toBe(false);
  });

  it("flags the Watch Couple + 1916 Company merge", () => {
    expect(
      flagPossibleMismatch("The Watch Couple", [
        { platform: "ig", handle: "thewatchcouple" },
        { platform: "yt", handle: "the1916company" },
      ]),
    ).toBe(true);
  });

  it("does not flag matching cross-platform handles", () => {
    expect(
      flagPossibleMismatch("Teddy Baldassarre", [
        { platform: "ig", handle: "teddybaldassarre" },
        { platform: "yt", handle: "teddybaldassarre" },
      ]),
    ).toBe(false);
  });

  it("does not flag when both handles share the creator name", () => {
    expect(
      flagPossibleMismatch("Bark and Jack", [
        { platform: "ig", handle: "barkandjack" },
        { platform: "yt", handle: "jackbark" },
      ]),
    ).toBe(false);
  });

  it("flags two unrelated handles with no shared distinctive token", () => {
    expect(
      flagPossibleMismatch("Some Reviewer", [
        { platform: "ig", handle: "wristcheck_daily" },
        { platform: "yt", handle: "horologyhouse" },
      ]),
    ).toBe(true);
  });
});
