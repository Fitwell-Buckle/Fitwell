import { describe, it, expect, vi } from "vitest";

// billing-csv.ts imports the live db; the pure parsers under test never touch it.
vi.mock("@/lib/db", () => ({ db: {} }));

import {
  parseBillingCsv,
  parseCsvRows,
  splitDescription,
} from "@/lib/shopify/billing-csv";

const HEADER =
  "Bill #,Store Name,Shop ID,.myshopify.com URL,Charge category,Description,Amount,Currency,Start of billing cycle,End of billing cycle,Date,Order,Rate,App,Original amount,Original currency,Exchange rate,Usage quantity";

function row(category: string, description: string, amount: string, date: string, order: string, bill = "1001") {
  // Quote description + order since they can contain commas.
  return `${bill},Fitwell,123,https://x,${category},"${description}",${amount},USD,"","",${date},${order},"","",${amount},USD,1.0,""`;
}

describe("parseCsvRows", () => {
  it("handles quoted fields containing commas", () => {
    const rows = parseCsvRows('a,"b, c",d\n1,"2, 3",4\n');
    expect(rows).toEqual([
      ["a", "b, c", "d"],
      ["1", "2, 3", "4"],
    ]);
  });

  it("handles escaped double-quotes", () => {
    expect(parseCsvRows('"say ""hi""",x')).toEqual([['say "hi"', "x"]]);
  });
});

describe("splitDescription", () => {
  it("splits service and destination on the first ' to '", () => {
    expect(splitDescription("DHL Express Worldwide to Ravensburg, ")).toEqual({
      service: "DHL Express Worldwide",
      destination: "Ravensburg",
    });
  });

  it("keeps multi-word US destinations", () => {
    expect(splitDescription("Ground Advantage to Oceanside, California")).toEqual({
      service: "Ground Advantage",
      destination: "Oceanside, California",
    });
  });

  it("falls back to service-only when there is no ' to '", () => {
    expect(splitDescription("Shipping adjustment")).toEqual({
      service: "Shipping adjustment",
      destination: null,
    });
  });

  it("returns nulls for empty input", () => {
    expect(splitDescription(null)).toEqual({ service: null, destination: null });
  });
});

describe("parseBillingCsv", () => {
  it("keeps only shipping_fee rows and maps fields", () => {
    const csv = [
      HEADER,
      row("subscription_fee", "Subscription Fee", "105.0", "2026-02-15", ""),
      row("shipping_fee", "Ground Advantage to Oceanside, California", "4.85", "2026-02-13", "FBC1697"),
      row("shipping_duties_taxes", "DHL Express", "10.45", "2026-02-15", ""),
      row("managed_markets_shipping_fee", "UPS Worldwide Expedited® to Kronberg, ", "22.35", "2026-02-15", ""),
    ].join("\n");

    const parsed = parseBillingCsv(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({
      billNumber: "1001",
      orderName: "FBC1697",
      orderNumber: 1697,
      chargeCategory: "shipping_fee",
      description: "Ground Advantage to Oceanside, California",
      service: "Ground Advantage",
      destination: "Oceanside, California",
      amountCents: 485,
      currency: "USD",
      chargedAt: new Date("2026-02-13"),
    });
  });

  it("converts amounts to integer cents", () => {
    const csv = [HEADER, row("shipping_fee", "X to Y", "39.06", "2026-02-15", "FBC1692")].join("\n");
    expect(parseBillingCsv(csv)[0].amountCents).toBe(3906);
  });

  it("parses the numeric order key from the FBC name", () => {
    const csv = [HEADER, row("shipping_fee", "X to Y", "5.00", "2026-02-15", "FBC1490")].join("\n");
    expect(parseBillingCsv(csv)[0].orderNumber).toBe(1490);
  });

  it("keeps multiple charges for the same order (no dedup)", () => {
    const csv = [
      HEADER,
      row("shipping_fee", "A to Z", "5.29", "2026-02-13", "FBC1490"),
      row("shipping_fee", "A to Z", "5.29", "2026-02-13", "FBC1490"),
      row("shipping_fee", "B to Z", "4.95", "2026-01-22", "FBC1490"),
    ].join("\n");
    const parsed = parseBillingCsv(csv);
    expect(parsed).toHaveLength(3);
    expect(parsed.map((c) => c.amountCents)).toEqual([529, 529, 495]);
  });

  it("throws if a required column is missing", () => {
    expect(() => parseBillingCsv("Bill #,Amount\n1,2")).toThrow(/missing expected column/);
  });
});
