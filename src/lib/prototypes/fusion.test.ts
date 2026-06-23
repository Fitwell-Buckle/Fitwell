import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAllowedFusionUrl,
  isFusionViewerUrl,
  resolveFusionEmbed,
  toEmbedUrl,
} from "./fusion";

describe("isAllowedFusionUrl", () => {
  it("accepts the a360.co short domain", () => {
    expect(isAllowedFusionUrl("https://a360.co/4vPkEVP")).toBe(true);
  });

  it("accepts autodesk360.com and hub subdomains", () => {
    expect(isAllowedFusionUrl("https://autodesk360.com/g/shares/SH1")).toBe(true);
    expect(
      isAllowedFusionUrl("https://gmail2692152.autodesk360.com/g/shares/SH1"),
    ).toBe(true);
  });

  it("rejects look-alike and unrelated hosts", () => {
    expect(isAllowedFusionUrl("https://autodesk360.com.evil.test/x")).toBe(false);
    expect(isAllowedFusionUrl("https://evil.test/autodesk360.com")).toBe(false);
    expect(isAllowedFusionUrl("https://a360.co.evil.test/x")).toBe(false);
  });

  it("rejects non-URLs and non-http(s) schemes", () => {
    expect(isAllowedFusionUrl("not a url")).toBe(false);
    expect(isAllowedFusionUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedFusionUrl("file:///etc/passwd")).toBe(false);
  });
});

describe("isFusionViewerUrl", () => {
  it("excludes the short-link domain (it only redirects)", () => {
    expect(isFusionViewerUrl("https://a360.co/4vPkEVP")).toBe(false);
  });
  it("accepts the canonical viewer host", () => {
    expect(
      isFusionViewerUrl("https://gmail2692152.autodesk360.com/g/shares/SH1"),
    ).toBe(true);
  });
});

describe("toEmbedUrl", () => {
  it("appends mode=embed", () => {
    expect(toEmbedUrl("https://x.autodesk360.com/g/shares/SH1")).toBe(
      "https://x.autodesk360.com/g/shares/SH1?mode=embed",
    );
  });
  it("is idempotent and overwrites an existing mode", () => {
    expect(toEmbedUrl("https://x.autodesk360.com/g/shares/SH1?mode=view")).toBe(
      "https://x.autodesk360.com/g/shares/SH1?mode=embed",
    );
  });
});

describe("resolveFusionEmbed", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("follows redirects to the canonical viewer and builds the embed URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        url: "https://gmail2692152.autodesk360.com/g/shares/SH90d2#frag",
      }),
    );
    const res = await resolveFusionEmbed("https://a360.co/4vPkEVP");
    expect(res).toEqual({
      canonicalUrl: "https://gmail2692152.autodesk360.com/g/shares/SH90d2",
      embedUrl:
        "https://gmail2692152.autodesk360.com/g/shares/SH90d2?mode=embed",
    });
  });

  it("returns null when the link resolves off Autodesk hosts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ url: "https://evil.test/phish" }),
    );
    expect(await resolveFusionEmbed("https://a360.co/x")).toBeNull();
  });

  it("returns null on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    expect(await resolveFusionEmbed("https://a360.co/x")).toBeNull();
  });
});
