import { describe, it, expect } from "vitest";
import { compileMjml, injectUtms } from "./templates";

describe("injectUtms", () => {
  const params = { campaign: "post-purchase", content: "03-outfit" };

  it("adds utm_* to a bare Fitwell absolute URL", () => {
    const html = `<a href="https://fitwellbuckle.co/products/foo">x</a>`;
    const out = injectUtms(html, params);
    expect(out).toContain("utm_source=klaviyo");
    expect(out).toContain("utm_medium=email");
    expect(out).toContain("utm_campaign=post-purchase");
    expect(out).toContain("utm_content=03-outfit");
  });

  it("preserves existing query parameters", () => {
    const html = `<a href="https://fitwellbuckle.co/products/foo?variant=42">x</a>`;
    const out = injectUtms(html, params);
    expect(out).toContain("variant=42");
    expect(out).toContain("utm_source=klaviyo");
  });

  it("leaves URLs with an existing utm_source alone", () => {
    const url = "https://fitwellbuckle.co/products/foo?utm_source=manual&utm_campaign=special";
    const html = `<a href="${url}">x</a>`;
    const out = injectUtms(html, params);
    expect(out).toContain("utm_source=manual");
    expect(out).not.toContain("utm_source=klaviyo");
    expect(out).toContain("utm_campaign=special");
    expect(out).not.toContain("utm_campaign=post-purchase");
  });

  it("ignores non-Fitwell URLs", () => {
    const html = `<a href="https://youtube.com/watch?v=abc">x</a>`;
    expect(injectUtms(html, params)).toBe(html);
  });

  it("rewrites Fitwell subdomains too", () => {
    const html = `<a href="https://blog.fitwellbuckle.co/posts/comfort">x</a>`;
    const out = injectUtms(html, params);
    expect(out).toContain("utm_source=klaviyo");
  });

  it("does not touch a similar-looking domain (defense against suffix match)", () => {
    const html = `<a href="https://notfitwellbuckle.co/spam">x</a>`;
    expect(injectUtms(html, params)).toBe(html);
  });

  it("leaves anchor-only links alone", () => {
    const html = `<a href="#hero">jump</a>`;
    expect(injectUtms(html, params)).toBe(html);
  });

  it("leaves mailto + tel links alone", () => {
    const html = `<a href="mailto:hi@fitwellbuckle.co">x</a><a href="tel:+15555550000">y</a>`;
    expect(injectUtms(html, params)).toBe(html);
  });

  it("leaves relative URLs alone (Klaviyo emails are all absolute in practice)", () => {
    const html = `<a href="/products/foo">x</a>`;
    expect(injectUtms(html, params)).toBe(html);
  });

  it("leaves Klaviyo merge tags alone", () => {
    const html = `<a href="{{ unsubscribe_link }}">unsubscribe</a>`;
    expect(injectUtms(html, params)).toBe(html);
  });

  it("works with single quotes around href", () => {
    const html = `<a href='https://fitwellbuckle.co/x'>x</a>`;
    const out = injectUtms(html, params);
    expect(out).toContain("utm_source=klaviyo");
    expect(out).toContain("href='https://fitwellbuckle.co/x");
  });

  it("matches uppercase HREF", () => {
    const html = `<a HREF="https://fitwellbuckle.co/x">x</a>`;
    expect(injectUtms(html, params)).toContain("utm_source=klaviyo");
  });

  it("rewrites multiple links in one pass", () => {
    const html = [
      `<a href="https://fitwellbuckle.co/a">a</a>`,
      `<a href="https://fitwellbuckle.co/b">b</a>`,
      `<a href="https://youtube.com/c">c</a>`,
    ].join("");
    const out = injectUtms(html, params);
    expect((out.match(/utm_source=klaviyo/g) ?? []).length).toBe(2);
    expect(out).toContain("https://youtube.com/c");
  });

  it("respects source / medium overrides", () => {
    const html = `<a href="https://fitwellbuckle.co/x">x</a>`;
    const out = injectUtms(html, {
      ...params,
      source: "klaviyo",
      medium: "sms",
    });
    expect(out).toContain("utm_medium=sms");
  });
});

describe("compileMjml", () => {
  it("compiles a minimal valid template to HTML", async () => {
    const source = `<mjml><mj-body><mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section></mj-body></mjml>`;
    const { html, warnings } = await compileMjml(source);
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("Hello");
    // mj-text becomes a styled <div> in the output
    expect(html).toMatch(/<html/i);
    expect(warnings).toEqual([]);
  });

  it("surfaces warnings for invalid tags (without throwing)", async () => {
    const source = `<mjml><mj-body><mj-bogus-tag>nope</mj-bogus-tag></mj-body></mjml>`;
    const { html, warnings } = await compileMjml(source);
    // mjml still produces output (best-effort), but warns about the unknown tag
    expect(html.length).toBeGreaterThan(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("returns empty html + warning for entirely malformed input (does not throw)", async () => {
    const source = `not mjml at all`;
    const { html, warnings } = await compileMjml(source);
    expect(html).toBe("");
    expect(warnings.length).toBeGreaterThan(0);
  });
});
