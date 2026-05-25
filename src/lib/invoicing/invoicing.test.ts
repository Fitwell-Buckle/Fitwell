import { describe, it, expect } from "vitest";
import {
  formatInvoiceNumber,
  computeInvoiceTotals,
  groupByCompany,
} from "@/lib/invoicing/invoicing";

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
