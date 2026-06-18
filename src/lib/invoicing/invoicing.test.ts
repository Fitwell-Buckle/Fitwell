import { describe, it, expect } from "vitest";
import {
  formatInvoiceNumber,
  computeInvoiceTotals,
  consolidateLinesBySku,
  groupByCompany,
  computeDeposit,
  draftDiscountPercent,
  netUnitPriceCents,
  netLineDisplays,
  shippingAddressLines,
} from "@/lib/invoicing/invoicing";

describe("draftDiscountPercent", () => {
  it("0 on the deposit path — the deposit line carries the price", () => {
    expect(draftDiscountPercent({ totalCents: 5000, hasDeposit: true, tierPercent: 62 })).toBe(0);
  });
  it("100% for a no-charge invoice so the Shopify draft is $0 too", () => {
    expect(draftDiscountPercent({ totalCents: 0, hasDeposit: false, tierPercent: 0 })).toBe(100);
  });
  it("the brand tier for a normal priced order", () => {
    expect(draftDiscountPercent({ totalCents: 5000, hasDeposit: false, tierPercent: 62 })).toBe(62);
  });
});

describe("shippingAddressLines", () => {
  it("returns [] for null", () => {
    expect(shippingAddressLines(null)).toEqual([]);
  });
  it("orders name/company/street/city-line/country and drops blanks", () => {
    expect(
      shippingAddressLines({
        firstName: "David",
        lastName: "Quinlan",
        company: "Awake Concept",
        address1: "12 Rue de la Paix",
        address2: null,
        city: "Paris",
        provinceCode: null,
        province: null,
        zip: "75002",
        country: "France",
      }),
    ).toEqual([
      "David Quinlan",
      "Awake Concept",
      "12 Rue de la Paix",
      "Paris, 75002",
      "France",
    ]);
  });
  it("prefers provinceCode over province in the city line", () => {
    expect(
      shippingAddressLines({ city: "Austin", provinceCode: "TX", province: "Texas", zip: "78701" }),
    ).toEqual(["Austin, TX, 78701"]);
  });
});

describe("computeDeposit", () => {
  it("0% = no deposit, full amount is the balance", () => {
    expect(computeDeposit(10000, 0)).toEqual({ depositCents: 0, balanceCents: 10000 });
    expect(computeDeposit(10000, null)).toEqual({ depositCents: 0, balanceCents: 10000 });
  });
  it("splits at the given percentage", () => {
    expect(computeDeposit(10000, 50)).toEqual({ depositCents: 5000, balanceCents: 5000 });
    expect(computeDeposit(10000, 30)).toEqual({ depositCents: 3000, balanceCents: 7000 });
  });
  it("rounds the deposit and keeps deposit + balance == total", () => {
    const { depositCents, balanceCents } = computeDeposit(10001, 50);
    expect(depositCents).toBe(5001); // round(5000.5)
    expect(depositCents + balanceCents).toBe(10001);
  });
  it("clamps out-of-range percentages", () => {
    expect(computeDeposit(10000, 150)).toEqual({ depositCents: 10000, balanceCents: 0 });
    expect(computeDeposit(10000, -10)).toEqual({ depositCents: 0, balanceCents: 10000 });
  });
});

describe("netUnitPriceCents", () => {
  it("returns retail when there is no discount", () => {
    expect(netUnitPriceCents(5000, 0)).toBe(5000);
    expect(netUnitPriceCents(5000, null as unknown as number)).toBe(5000);
  });
  it("applies the discount percentage and rounds to the nearest cent", () => {
    expect(netUnitPriceCents(5000, 30)).toBe(3500);
    expect(netUnitPriceCents(999, 33)).toBe(669); // round(669.33)
  });
  it("clamps out-of-range percentages", () => {
    expect(netUnitPriceCents(5000, 150)).toBe(0);
    expect(netUnitPriceCents(5000, -10)).toBe(5000);
  });
});

describe("netLineDisplays", () => {
  it("returns net unit + net line totals that foot to the invoice total", () => {
    const lines = [
      { quantity: 10, unitPriceCents: 5000 },
      { quantity: 2, unitPriceCents: 2500 },
    ];
    const { totalCents } = computeInvoiceTotals(lines, 30);
    const rows = netLineDisplays(lines, 30, totalCents);
    expect(rows[0].netUnitPriceCents).toBe(3500); // 5000 − 30%
    expect(rows.reduce((a, r) => a + r.netLineTotalCents, 0)).toBe(totalCents);
  });

  it("absorbs per-line rounding drift into the last line", () => {
    // 4 × ($1.05, qty 1) at 10%: per-line net rounds to 95¢ each (Σ 380),
    // but the order-level total is 378¢ — the last line absorbs the −2¢.
    const lines = Array.from({ length: 4 }, () => ({ quantity: 1, unitPriceCents: 105 }));
    const { totalCents } = computeInvoiceTotals(lines, 10);
    expect(totalCents).toBe(378);
    const rows = netLineDisplays(lines, 10, totalCents);
    expect(rows.reduce((a, r) => a + r.netLineTotalCents, 0)).toBe(378);
    expect(rows[3].netLineTotalCents).toBe(93); // 95 − 2 drift
  });

  it("is unchanged from retail when there is no discount", () => {
    const lines = [{ quantity: 3, unitPriceCents: 1000 }];
    const { totalCents } = computeInvoiceTotals(lines, 0);
    const rows = netLineDisplays(lines, 0, totalCents);
    expect(rows[0]).toEqual({ netUnitPriceCents: 1000, netLineTotalCents: 3000 });
  });
});

describe("formatInvoiceNumber", () => {
  it("zero-pads with an INV- prefix", () => {
    expect(formatInvoiceNumber(100)).toBe("INV-00100");
    expect(formatInvoiceNumber(101)).toBe("INV-00101");
    expect(formatInvoiceNumber(100000)).toBe("INV-100000");
  });
});

describe("computeInvoiceTotals", () => {
  it("sums line totals and applies the discount percentage", () => {
    const t = computeInvoiceTotals(
      [
        { quantity: 10, unitPriceCents: 5000 }, // 50000
        { quantity: 2, unitPriceCents: 2500 }, // 5000
      ],
      30,
    );
    expect(t.subtotalCents).toBe(55000);
    expect(t.discountCents).toBe(16500); // 30%
    expect(t.totalCents).toBe(38500);
  });

  it("rounds the discount to the nearest cent", () => {
    const t = computeInvoiceTotals([{ quantity: 1, unitPriceCents: 999 }], 33);
    expect(t.discountCents).toBe(330); // round(329.67)
    expect(t.totalCents).toBe(669);
  });

  it("handles a zero discount", () => {
    const t = computeInvoiceTotals([{ quantity: 3, unitPriceCents: 1000 }], 0);
    expect(t).toEqual({ subtotalCents: 3000, discountCents: 0, totalCents: 3000 });
  });

  it("clamps an out-of-range discount", () => {
    expect(computeInvoiceTotals([{ quantity: 1, unitPriceCents: 100 }], 150).discountCents).toBe(100);
    expect(computeInvoiceTotals([{ quantity: 1, unitPriceCents: 100 }], -10).discountCents).toBe(0);
  });

  it("is zero for no lines", () => {
    expect(computeInvoiceTotals([], 30)).toEqual({
      subtotalCents: 0,
      discountCents: 0,
      totalCents: 0,
    });
  });
});

describe("groupByCompany", () => {
  it("buckets items by company key and sets aside unassigned ones", () => {
    const items = [
      { id: "a", company: "c1" },
      { id: "b", company: "c2" },
      { id: "c", company: "c1" },
      { id: "d", company: null },
    ];
    const { groups, unassigned } = groupByCompany(items, (i) => i.company);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.companyId === "c1")!.items.map((i) => i.id)).toEqual([
      "a",
      "c",
    ]);
    expect(groups.find((g) => g.companyId === "c2")!.items.map((i) => i.id)).toEqual(["b"]);
    expect(unassigned.map((i) => i.id)).toEqual(["d"]);
  });

  it("treats empty-string keys as unassigned", () => {
    const { groups, unassigned } = groupByCompany([{ id: "x", c: "" }], (i) => i.c);
    expect(groups).toHaveLength(0);
    expect(unassigned).toHaveLength(1);
  });
});

describe("consolidateLinesBySku", () => {
  it("collapses split lines (same SKU) into one row, summing quantity", () => {
    const out = consolidateLinesBySku([
      { sku: "A", title: "Buckle A", quantity: 5, unitPriceCents: 1520 },
      { sku: "A", title: "Buckle A", quantity: 5, unitPriceCents: 1520 },
      { sku: "B", title: "Buckle B", quantity: 4, unitPriceCents: 1520 },
      { sku: "B", title: "Buckle B", quantity: 6, unitPriceCents: 1520 },
    ]);
    expect(out).toEqual([
      { sku: "A", title: "Buckle A", quantity: 10, unitPriceCents: 1520 },
      { sku: "B", title: "Buckle B", quantity: 10, unitPriceCents: 1520 },
    ]);
  });

  it("keeps lines with the same SKU but different unit prices separate", () => {
    const out = consolidateLinesBySku([
      { sku: "A", title: "Buckle A", quantity: 2, unitPriceCents: 1520 },
      { sku: "A", title: "Buckle A (sale)", quantity: 3, unitPriceCents: 1000 },
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((l) => l.quantity)).toEqual([2, 3]);
  });

  it("is a no-op for a non-split order (one line per SKU)", () => {
    const lines = [
      { sku: "A", title: "Buckle A", quantity: 3, unitPriceCents: 1520 },
      { sku: "B", title: "Buckle B", quantity: 1, unitPriceCents: 1520 },
    ];
    expect(consolidateLinesBySku(lines)).toEqual(lines);
  });
});
