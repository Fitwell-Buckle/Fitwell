import { describe, it, expect, vi } from "vitest";

// addresses.ts imports db + schema at module load; mock them so the pure
// helpers can be imported without a DB connection.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/schema", () => ({ company: {}, customer: {}, customerAddress: {} }));

import { shipToLabel, shipToToShopify } from "./addresses";

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
