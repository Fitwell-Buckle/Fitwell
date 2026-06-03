import { describe, expect, it } from "vitest";
import { escapeHtml, plainTextToHtml } from "./mime";
import { buildPixelUrl } from "@/lib/crm/tracking";

describe("escapeHtml", () => {
  it("escapes the dangerous characters", () => {
    expect(escapeHtml(`a & b < c > d "e"`)).toBe(
      "a &amp; b &lt; c &gt; d &quot;e&quot;",
    );
  });
});

describe("plainTextToHtml", () => {
  it("converts newlines to <br> and escapes", () => {
    const html = plainTextToHtml("Hi <there>\nLine 2");
    expect(html).toContain("Hi &lt;there&gt;<br>\nLine 2");
  });

  it("omits the pixel when no url given", () => {
    expect(plainTextToHtml("hello")).not.toContain("<img");
  });

  it("embeds a hidden tracking pixel when a url is given", () => {
    const html = plainTextToHtml("hello", "https://x.co/p.gif");
    expect(html).toContain('src="https://x.co/p.gif"');
    expect(html).toContain("display:none");
    expect(html).toContain('width="1"');
  });

  it("escapes the pixel url", () => {
    const html = plainTextToHtml("hi", 'https://x.co/p.gif?a="b"&c');
    expect(html).toContain("&amp;c");
    expect(html).not.toContain('?a="b"');
  });
});

describe("buildPixelUrl", () => {
  it("builds the route url and strips a trailing slash on the base", () => {
    expect(buildPixelUrl("https://admin.example.com/", "tok123")).toBe(
      "https://admin.example.com/api/track/open/tok123.gif",
    );
  });

  it("url-encodes the token", () => {
    expect(buildPixelUrl("https://x.co", "a/b c")).toBe(
      "https://x.co/api/track/open/a%2Fb%20c.gif",
    );
  });
});
