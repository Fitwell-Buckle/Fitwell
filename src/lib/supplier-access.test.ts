import { describe, it, expect } from "vitest";
import { canMagicLinkSignIn, canSupplierAccessPo } from "@/lib/supplier-access";

describe("canMagicLinkSignIn", () => {
  it("allows an email that resolves to a supplier", () => {
    expect(canMagicLinkSignIn("supplier-123", null, false)).toBe(true);
  });

  it("allows an email that resolves to a company", () => {
    expect(canMagicLinkSignIn(null, "company-123", false)).toBe(true);
  });

  it("allows an allowed admin even without a supplier/company match", () => {
    expect(canMagicLinkSignIn(null, null, true)).toBe(true);
    expect(canMagicLinkSignIn(undefined, undefined, true)).toBe(true);
  });

  it("denies an email that is none of supplier, company, or admin", () => {
    expect(canMagicLinkSignIn(null, null, false)).toBe(false);
    expect(canMagicLinkSignIn(undefined, undefined, false)).toBe(false);
    expect(canMagicLinkSignIn("", "", false)).toBe(false);
  });

  it("allows when multiple conditions are true", () => {
    expect(canMagicLinkSignIn("supplier-123", "company-123", true)).toBe(true);
  });
});

describe("canSupplierAccessPo", () => {
  it("allows access to a PO the supplier owns", () => {
    expect(canSupplierAccessPo("supplier-A", "supplier-A")).toBe(true);
  });

  it("denies access to another supplier's PO", () => {
    expect(canSupplierAccessPo("supplier-A", "supplier-B")).toBe(false);
  });

  it("denies when the PO has no supplier", () => {
    expect(canSupplierAccessPo(null, "supplier-A")).toBe(false);
    expect(canSupplierAccessPo(undefined, "supplier-A")).toBe(false);
    expect(canSupplierAccessPo("", "supplier-A")).toBe(false);
  });

  it("denies when the session has no supplier id", () => {
    expect(canSupplierAccessPo("supplier-A", null)).toBe(false);
    expect(canSupplierAccessPo("supplier-A", undefined)).toBe(false);
    expect(canSupplierAccessPo("supplier-A", "")).toBe(false);
  });

  it("denies when both are missing (no empty-string match)", () => {
    expect(canSupplierAccessPo("", "")).toBe(false);
    expect(canSupplierAccessPo(null, null)).toBe(false);
  });
});
