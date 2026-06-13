import { describe, it, expect, vi } from "vitest";

// addresses.ts imports db + schema at module load; mock them so the pure
// helpers can be imported without a DB connection.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/schema", () => ({ company: {}, customer: {}, customerAddress: {} }));

import { shipToLabel, shipToToShopify, isSplitOrder, buildShipPlan } from "./addresses";

const s = {
  addressId: "a1",
  firstName: "Sam",
  lastName: "Byon",
  company: "Byon Co",
  address1: "1 Main St",
  address2: "Ste 2",
  city: "Austin",
  province: "Texas",
  provinceCode: "TX",
  country: "United States",
  zip: "78701",
  phone: "555",
};

describe("ship-to helpers", () => {
  it("shipToLabel builds a readable one-liner using the province code", () => {
    expect(shipToLabel(s)).toBe("Sam Byon, 1 Main St, Austin, TX, 78701");
  });

  it("shipToToShopify keeps Shopify fields and drops addressId/provinceCode", () => {
    const out = shipToToShopify(s);
    expect(out).toEqual({
      firstName: "Sam",
      lastName: "Byon",
      company: "Byon Co",
      address1: "1 Main St",
      address2: "Ste 2",
      city: "Austin",
      province: "Texas",
      country: "United States",
      zip: "78701",
      phone: "555",
    });
    expect(out).not.toHaveProperty("addressId");
    expect(out).not.toHaveProperty("provinceCode");
  });

  it("shipToLabel falls back to company when there's no person name", () => {
    expect(shipToLabel({ company: "Byon Co", city: "Austin" })).toBe("Byon Co, Austin");
  });
});

describe("ship plan (split fulfillment)", () => {
  const primary = { addressId: "p", firstName: "HQ", address1: "1 HQ St", city: "Austin", provinceCode: "TX", zip: "78701" };
  const wh = { addressId: "w", firstName: "WH", address1: "9 Dock Rd", city: "Reno", provinceCode: "NV", zip: "89501" };
  const lines = [
    { sku: "A", title: "Buckle A", quantity: 2, shipTo: null },
    { sku: "B", title: "Buckle B", quantity: 1, shipTo: wh },
    { sku: "C", title: "Buckle C", quantity: 3, shipTo: null },
  ];

  it("isSplitOrder is true only when a line has its own ship-to", () => {
    expect(isSplitOrder(lines)).toBe(true);
    expect(isSplitOrder([{ shipTo: null }, { shipTo: null }])).toBe(false);
  });

  it("buildShipPlan groups lines by destination, default-address lines together", () => {
    const plan = buildShipPlan(lines, primary);
    expect(plan).toHaveLength(2);

    const def = plan.find((g) => g.isDefault)!;
    expect(def.label).toContain("1 HQ St");
    expect(def.lines.map((l) => l.sku)).toEqual(["A", "C"]);

    const whGroup = plan.find((g) => !g.isDefault)!;
    expect(whGroup.label).toContain("9 Dock Rd");
    expect(whGroup.lines.map((l) => l.sku)).toEqual(["B"]);
  });
});
