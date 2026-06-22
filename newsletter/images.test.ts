import { describe, expect, it } from "vitest";
import { extractArticleText, extractOgImage, pageNeedsProxy } from "./images";

describe("pageNeedsProxy", () => {
  it("proxies article pages for proxied + scraped sources", () => {
    expect(pageNeedsProxy("watchtime")).toBe(true); // rss-proxied
    expect(pageNeedsProxy("watchpro")).toBe(true); // scrape-watchpro
  });

  it("proxies aBlogtoWatch pages (feed direct, but pages are WAF-walled)", () => {
    expect(pageNeedsProxy("ablogtowatch")).toBe(true);
  });

  it("leaves ordinary direct-RSS sources unproxied", () => {
    expect(pageNeedsProxy("hodinkee")).toBe(false);
    expect(pageNeedsProxy("nonexistent-slug")).toBe(false);
  });
});

describe("extractOgImage", () => {
  it("finds a standard og:image meta tag", () => {
    expect(
      extractOgImage(
        `<head><meta property="og:image" content="https://cdn.x.com/a.jpg" /></head>`,
      ),
    ).toBe("https://cdn.x.com/a.jpg");
  });

  it("handles content-before-property attribute order", () => {
    expect(
      extractOgImage(
        `<meta content="https://cdn.x.com/b.png" property="og:image">`,
      ),
    ).toBe("https://cdn.x.com/b.png");
  });

  it("accepts og:image:secure_url and name= variants", () => {
    expect(
      extractOgImage(
        `<meta name="og:image:secure_url" content="https://cdn.x.com/c.webp">`,
      ),
    ).toBe("https://cdn.x.com/c.webp");
  });

  it("falls back to twitter:image", () => {
    expect(
      extractOgImage(
        `<meta name="twitter:image" content="https://cdn.x.com/d.jpg">`,
      ),
    ).toBe("https://cdn.x.com/d.jpg");
  });

  it("rejects non-http values and missing tags", () => {
    expect(extractOgImage(`<meta property="og:image" content="/relative.jpg">`)).toBeNull();
    expect(extractOgImage(`<head><title>no images</title></head>`)).toBeNull();
  });
});

const PARA = "The new chronograph measures 39mm across and ships in October for $2,450, limited to 300 pieces worldwide.";

describe("extractArticleText", () => {
  it("prefers the <article> element over surrounding page chrome", () => {
    const html = `
      <body>
        <p>Subscribe to our newsletter and never miss a story from us again!</p>
        <article><p>${PARA}</p><p>${PARA} It uses the brand's in-house caliber with a 70-hour reserve.</p></article>
        <footer><p>About us — we are a watch publication with a long history of coverage.</p></footer>
      </body>`;
    const text = extractArticleText(html);
    expect(text).toContain("$2,450");
    expect(text).not.toContain("Subscribe to our newsletter");
    expect(text).not.toContain("About us");
  });

  it("falls back to all paragraphs when no <article> tag exists", () => {
    const html = `<div><p>${PARA}</p><p>${PARA}</p></div>`;
    expect(extractArticleText(html)).toContain("limited to 300 pieces");
  });

  it("strips scripts, styles, and inline tags; decodes entities", () => {
    const html = `<article>
      <script>var x = "should not appear in output at all";</script>
      <style>.a { color: red; }</style>
      <p>The brand&#8217;s new <a href="/x">flagship</a> costs &amp;pound;1,200 &#8212; a first for them and a notable shift in pricing strategy.</p>
      <p>${PARA}</p>
    </article>`;
    const text = extractArticleText(html)!;
    expect(text).toContain("brand’s new flagship");
    expect(text).toContain("—");
    expect(text).not.toContain("should not appear");
    expect(text).not.toContain("color: red");
  });

  it("returns null for pages with no real article body", () => {
    expect(extractArticleText(`<body><p>Loading…</p></body>`)).toBeNull();
    expect(extractArticleText(`<body><div>JS app shell</div></body>`)).toBeNull();
  });

  it("caps very long articles", () => {
    const long = `<article>${`<p>${PARA}</p>`.repeat(300)}</article>`;
    const text = extractArticleText(long)!;
    expect(text.length).toBeLessThanOrEqual(12_001);
    expect(text.endsWith("…")).toBe(true);
  });
});
