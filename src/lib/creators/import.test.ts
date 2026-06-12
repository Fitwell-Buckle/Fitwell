import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  mapHeaders,
  parseCount,
  parseCsv,
  parseRate,
  transformCsv,
} from "./import";

const FIXTURE = readFileSync(
  join(__dirname, "__fixtures__", "creators-sample.csv"),
  "utf8",
);
const AS_OF = new Date("2026-06-12T00:00:00Z");

describe("parseCsv", () => {
  it("handles quoted fields with commas and escaped quotes", () => {
    const rows = parseCsv('a,"b, c","say ""hi"""\nd,e,f\n');
    expect(rows).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["d", "e", "f"],
    ]);
  });

  it("handles CRLF and trailing newline", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("mapHeaders", () => {
  it("maps aliases case-insensitively", () => {
    const map = mapHeaders(["Name", "Instagram_Handle", "YT_Subscribers"]);
    expect(map.name).toBe(0);
    expect(map.ig_handle).toBe(1);
    expect(map.yt_subscribers).toBe(2);
  });

  it("throws with the header list when no handle column exists", () => {
    expect(() => mapHeaders(["foo", "bar"])).toThrow(/no recognizable handle/);
  });
});

describe("coercion", () => {
  it("parseCount handles commas and K/M suffixes", () => {
    expect(parseCount("12,345")).toBe(12345);
    expect(parseCount("12.3K")).toBe(12300);
    expect(parseCount("1.2M")).toBe(1200000);
    expect(parseCount("")).toBeNull();
    expect(parseCount("n/a")).toBeNull();
  });

  it("parseRate strips % signs", () => {
    expect(parseRate("3.2%")).toBe(3.2);
    expect(parseRate("3.2")).toBe(3.2);
  });
});

describe("transformCsv on the fixture", () => {
  const { creators, issues } = transformCsv(FIXTURE, AS_OF);

  it("imports 4 creators and reports 1 broken row", () => {
    expect(creators).toHaveLength(4);
    expect(issues).toEqual([
      { rowIndex: 5, reason: "no IG or YT handle" },
    ]);
  });

  it("multi-platform creator gets both platform records", () => {
    const henry = creators.find((c) => c.name === "Watch Henry")!;
    expect(henry.platforms.map((p) => p.platform).sort()).toEqual(["ig", "yt"]);
    // YT 120K subs > IG 45K followers → primary yt
    expect(henry.primaryPlatform).toBe("yt");
    // cross-platform fit = max + 0.2 × min, strictly above the best single
    const fits = henry.platforms.map((p) => p.fitScore);
    expect(henry.crossPlatformFit).toBeCloseTo(
      Math.max(...fits) + 0.2 * Math.min(...fits),
    );
  });

  it("normalizes handles (strips @, lowercases)", () => {
    const henry = creators.find((c) => c.name === "Watch Henry")!;
    const ig = henry.platforms.find((p) => p.platform === "ig")!;
    expect(ig.handle).toBe("watchhenry");
  });

  it("scores watch-heavy bios above lifestyle bios", () => {
    const henry = creators.find((c) => c.name === "Watch Henry")!;
    const lena = creators.find((c) => c.name === "Lifestyle Lena")!;
    const henryIg = henry.platforms.find((p) => p.platform === "ig")!;
    const lenaIg = lena.platforms[0];
    expect(henryIg.watchScore).toBeGreaterThan(lenaIg.watchScore);
    // Lena's bio only has "watch this space" — verb usage, stripped → 0
    expect(lenaIg.watchScore).toBe(0);
    expect(lenaIg.watchConfidence).toBe("none");
  });

  it("collects explicit + bio-extracted + obfuscated emails with kinds", () => {
    const henry = creators.find((c) => c.name === "Watch Henry")!;
    expect(henry.emails.map((e) => e.email)).toContain("press@watchhenry.com");
    expect(
      henry.emails.find((e) => e.email === "press@watchhenry.com")!.kind,
    ).toBe("business");

    const mia = creators.find((c) => c.name === "EDC Mia")!;
    // bracket-obfuscated in bio: mia.edc [at] gmail [dot] com
    expect(mia.emails.map((e) => e.email)).toContain("mia.edc@gmail.com");
    expect(mia.emails.find((e) => e.email === "mia.edc@gmail.com")!.kind).toBe(
      "personal",
    );
  });

  it("profile-only rows get partial (renormalised) fit scores", () => {
    const strapLab = creators.find((c) => c.name === "Strap Lab")!;
    const yt = strapLab.platforms[0];
    // no ER, no last-post date → partial
    expect(yt.fitScorePartial).toBe(true);
    expect(yt.fitScore).toBeGreaterThan(0);
  });

  it("single-platform creators pass fit through as cross_platform_fit", () => {
    const mia = creators.find((c) => c.name === "EDC Mia")!;
    expect(mia.platforms).toHaveLength(1);
    expect(mia.crossPlatformFit).toBeCloseTo(mia.platforms[0].fitScore);
    expect(mia.primaryPlatform).toBe("ig");
  });

  it("stats snapshot fields are coerced", () => {
    const henry = creators.find((c) => c.name === "Watch Henry")!;
    const ig = henry.platforms.find((p) => p.platform === "ig")!;
    expect(ig.stats.followers).toBe(45000);
    expect(ig.stats.engagementRatePct).toBe(3.2);
    expect(ig.stats.lastPostDate?.toISOString().slice(0, 10)).toBe("2026-06-05");
    expect(ig.isBusinessAccount).toBe(true);
  });

  it("is deterministic (same input → same output)", () => {
    const second = transformCsv(FIXTURE, AS_OF);
    expect(second.creators).toEqual(creators);
  });
});
