import { describe, it, expect } from "vitest";
import {
  detectCompanyConflict,
  companyConflictMessage,
  type CompanyIdentity,
} from "./company-conflict";

const existing: CompanyIdentity[] = [
  { id: "1", name: "Acme Co", contactEmail: "buyer@acme.com" },
  { id: "2", name: "Globex", contactEmail: null },
];

describe("detectCompanyConflict", () => {
  it("returns null when name and email are unique", () => {
    expect(
      detectCompanyConflict(
        { name: "Initech", contactEmail: "new@initech.com" },
        existing,
      ),
    ).toBeNull();
  });

  it("flags a duplicate name, case- and whitespace-insensitively", () => {
    expect(
      detectCompanyConflict({ name: "  acme co  ", contactEmail: null }, existing),
    ).toBe("name");
  });

  it("flags a duplicate email, case-insensitively", () => {
    expect(
      detectCompanyConflict(
        { name: "Different", contactEmail: "BUYER@acme.com" },
        existing,
      ),
    ).toBe("email");
  });

  it("prioritizes a name conflict over an email conflict", () => {
    expect(
      detectCompanyConflict(
        { name: "Acme Co", contactEmail: "buyer@acme.com" },
        existing,
      ),
    ).toBe("name");
  });

  it("excludes the row being edited", () => {
    expect(
      detectCompanyConflict(
        { name: "Acme Co", contactEmail: "buyer@acme.com" },
        existing,
        "1",
      ),
    ).toBeNull();
  });

  it("ignores empty/missing candidate fields", () => {
    expect(detectCompanyConflict({ name: "" }, existing)).toBeNull();
    expect(detectCompanyConflict({ contactEmail: "" }, existing)).toBeNull();
    // An empty contactEmail must not match the null-email existing company.
    expect(
      detectCompanyConflict({ name: "Unique", contactEmail: "" }, existing),
    ).toBeNull();
  });
});

describe("companyConflictMessage", () => {
  it("formats per field", () => {
    expect(companyConflictMessage("name", "Acme Co")).toContain("Acme Co");
    expect(companyConflictMessage("email", "a@b.co")).toContain("a@b.co");
  });
});
