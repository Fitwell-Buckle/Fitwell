import { describe, expect, it } from "vitest";
import { matchPhone, normalizePhone, type PhoneIndex } from "./phone-match";

describe("normalizePhone", () => {
  it("strips formatting to the last 10 digits", () => {
    // "41788809292" → last 10 digits.
    expect(normalizePhone("+ 41 78 880 92 92")).toBe("1788809292");
    expect(normalizePhone("+1 (415) 555-0199")).toBe("4155550199");
  });
  it("returns null for too-short input", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

const index: PhoneIndex = {
  leadByPhone: new Map([[normalizePhone("+41 78 880 92 92")!, "lead_1"]]),
  customerByPhone: new Map([[normalizePhone("+1 415 555 0199")!, "cust_1"]]),
  supplierByPhone: new Map([[normalizePhone("+86 21 1234 5678")!, "sup_1"]]),
};

describe("matchPhone", () => {
  it("matches a lead regardless of formatting/country-code spacing", () => {
    expect(matchPhone("41788809292", index)).toEqual({
      leadId: "lead_1",
      customerId: null,
      supplierId: null,
    });
  });
  it("matches a customer", () => {
    expect(matchPhone("+1 (415) 555-0199", index)).toEqual({
      leadId: null,
      customerId: "cust_1",
      supplierId: null,
    });
  });
  it("matches a supplier", () => {
    expect(matchPhone("862112345678", index)?.supplierId).toBe("sup_1");
  });
  it("returns null for an unknown number", () => {
    expect(matchPhone("+44 20 7946 0000", index)).toBeNull();
  });
});
