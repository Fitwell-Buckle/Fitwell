import { describe, expect, it } from "vitest";
import {
  createSupplierLeadSchema,
  supplierLeadToSupplierInput,
  updateSupplierLeadSchema,
} from "./lead-validation";

// Base shape for the pure mapping helper (only the fields it reads).
function leadFixture(
  over: Partial<Parameters<typeof supplierLeadToSupplierInput>[0]> = {},
) {
  return {
    firstName: "ada",
    lastName: "lovelace",
    email: "ada@acme-metals.com",
    phone: "+1 555 0100",
    companyName: "Acme Metals",
    addressLine1: "1 Foundry Rd",
    addressLine2: "Unit 4",
    city: "Sheffield",
    region: "South Yorkshire",
    postalCode: "S1 2AB",
    country: "United Kingdom",
    notes: "Met at the Basel hardware show",
    ...over,
  };
}

describe("supplierLeadToSupplierInput", () => {
  it("maps a fully-populated lead to a supplier insert", () => {
    const out = supplierLeadToSupplierInput(leadFixture());
    expect(out.name).toBe("Acme Metals");
    expect(out.contactName).toBe("ada lovelace");
    expect(out.contactEmail).toBe("ada@acme-metals.com");
    expect(out.phone).toBe("+1 555 0100");
    expect(out.notes).toBe("Met at the Basel hardware show");
    // Address lines composed into the single shipping_address column.
    expect(out.shippingAddress).toBe(
      "1 Foundry Rd\nUnit 4\nSheffield, South Yorkshire, S1 2AB\nUnited Kingdom",
    );
  });

  it("falls back company name → person name → email for the required name", () => {
    expect(
      supplierLeadToSupplierInput(leadFixture({ companyName: null })).name,
    ).toBe("ada lovelace");
    expect(
      supplierLeadToSupplierInput(
        leadFixture({ companyName: null, firstName: null, lastName: null }),
      ).name,
    ).toBe("ada@acme-metals.com");
    expect(
      supplierLeadToSupplierInput(
        leadFixture({
          companyName: null,
          firstName: null,
          lastName: null,
          email: null,
        }),
      ).name,
    ).toBe("Untitled");
  });

  it("returns null shipping address when no address fields are present", () => {
    const out = supplierLeadToSupplierInput(
      leadFixture({
        addressLine1: null,
        addressLine2: null,
        city: null,
        region: null,
        postalCode: null,
        country: null,
      }),
    );
    expect(out.shippingAddress).toBeNull();
  });

  it("drops empty address segments instead of leaving stray commas", () => {
    const out = supplierLeadToSupplierInput(
      leadFixture({
        addressLine2: null,
        region: null,
        country: null,
      }),
    );
    expect(out.shippingAddress).toBe("1 Foundry Rd\nSheffield, S1 2AB");
  });
});

describe("createSupplierLeadSchema", () => {
  it("accepts a lead with at least one identity field", () => {
    const parsed = createSupplierLeadSchema.parse({
      companyName: "Acme Metals",
      supplierType: "metal_hardware",
    });
    expect(parsed.companyName).toBe("Acme Metals");
  });

  it("rejects a fully-empty payload", () => {
    expect(() => createSupplierLeadSchema.parse({})).toThrow();
  });

  it("rejects an unknown supplier type", () => {
    expect(() =>
      createSupplierLeadSchema.parse({
        companyName: "Acme",
        supplierType: "not_a_type",
      }),
    ).toThrow();
  });

  it("rejects a malformed email", () => {
    expect(() =>
      createSupplierLeadSchema.parse({ email: "not-an-email" }),
    ).toThrow();
  });
});

describe("updateSupplierLeadSchema", () => {
  it("is fully optional (empty patch parses)", () => {
    expect(updateSupplierLeadSchema.parse({})).toEqual({});
  });

  it("validates status enum", () => {
    expect(updateSupplierLeadSchema.parse({ status: "dropped" }).status).toBe(
      "dropped",
    );
    expect(() =>
      updateSupplierLeadSchema.parse({ status: "bogus" }),
    ).toThrow();
  });
});
