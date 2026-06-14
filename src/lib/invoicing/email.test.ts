import { describe, it, expect } from "vitest";
import {
  buildInvoiceEmailHtml,
  buildGiftEmailHtml,
} from "./email";

describe("buildInvoiceEmailHtml", () => {
  const html = buildInvoiceEmailHtml({
    invoiceNumber: "INV-00100",
    companyName: "Acme Co",
    issuedDate: "2026-06-01",
    dueDate: null,
    discountPercent: 30,
    totalCents: 35000,
    notes: null,
    lineItems: [
      { sku: "A1", title: "Buckle A", quantity: 10, unitPriceCents: 5000 },
    ],
    payUrl: "https://pay.test/x",
  });

  it("renders the invoice heading, partner discount note, total and pay button", () => {
    expect(html).toContain("Invoice INV-00100");
    expect(html).toContain("Billed to Acme Co");
    expect(html).toContain("Includes 30% partner discount");
    expect(html).toContain("$350.00");
    expect(html).toContain("Pay online");
    expect(html).toContain("https://pay.test/x");
  });
});

describe("buildGiftEmailHtml", () => {
  const html = buildGiftEmailHtml({
    orderNumber: "GIFT-00100",
    influencerName: "Maker Minute",
    issuedDate: "2026-06-01",
    contentDueDate: "2026-07-01",
    affiliateLink: "https://fitwell.test/ref/maker",
    subtotalCents: 12500,
    notes: null,
    lineItems: [
      { sku: "G1", title: "Buckle A", quantity: 2, unitPriceCents: 5000 },
      { sku: "G2", title: "Buckle B", quantity: 1, unitPriceCents: 2500 },
    ],
  });

  it("shows the gift heading, gift value, and a $0 charge", () => {
    expect(html).toContain("Your gift from Fitwell Buckle Co.");
    expect(html).toContain("Gifting order GIFT-00100 · For Maker Minute");
    expect(html).toContain("Gift value");
    expect(html).toContain("$125.00"); // 2×5000 + 1×2500 gift value
    expect(html).toContain("You pay");
    expect(html).toContain("$0.00");
  });

  it("includes the content deadline and the affiliate tracking link", () => {
    expect(html).toContain("publish your content by");
    expect(html).toContain("https://fitwell.test/ref/maker");
  });

  it("never shows payment or wire blocks (gifting is 100% off)", () => {
    expect(html).not.toContain("Pay online");
    expect(html).not.toContain("Pay by bank wire");
    expect(html).not.toContain("Pay balance");
  });
});
