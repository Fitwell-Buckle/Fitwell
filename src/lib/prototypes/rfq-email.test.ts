import { describe, it, expect } from "vitest";
import { buildRfqEmailHtml } from "./rfq-email";

describe("buildRfqEmailHtml", () => {
  const base = {
    vendorName: "Shenzhen Metals",
    prototypeName: "Titanium micro-adjust v2",
    proposedSku: "FW-TI-002",
    description: "Grade 5 titanium, bead-blasted.",
    message: "Targeting 5,000 units.",
    fusionLinks: [{ url: "https://a360.co/abc", title: "Body v2" }],
  };

  it("includes the vendor, prototype, SKU, spec, and message", () => {
    const html = buildRfqEmailHtml(base);
    expect(html).toContain("Request for Quote");
    expect(html).toContain("Shenzhen Metals");
    expect(html).toContain("Titanium micro-adjust v2");
    expect(html).toContain("FW-TI-002");
    expect(html).toContain("Grade 5 titanium");
    expect(html).toContain("Targeting 5,000 units.");
  });

  it("lists the CAD links and the requested quote fields", () => {
    const html = buildRfqEmailHtml(base);
    expect(html).toContain("https://a360.co/abc");
    expect(html).toContain("Body v2");
    expect(html).toMatch(/Unit price/);
    expect(html).toMatch(/Lead time/);
    expect(html).toMatch(/MOQ|Minimum order quantity/);
    expect(html).toMatch(/Tooling/);
  });

  it("omits optional sections when absent and escapes HTML", () => {
    const html = buildRfqEmailHtml({
      vendorName: "A & B <Co>",
      prototypeName: "P",
      proposedSku: null,
      description: null,
      message: null,
      fusionLinks: [],
    });
    expect(html).toContain("A &amp; B &lt;Co&gt;");
    expect(html).not.toContain("Proposed SKU");
    expect(html).not.toContain("CAD reference");
  });
});
