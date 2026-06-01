import { describe, expect, it } from "vitest";
import {
  companyEmailDomain,
  extractEmailDomain,
  isFreeEmailDomain,
} from "@/lib/crm/email";

describe("extractEmailDomain", () => {
  it("extracts a lowercased domain from a typical email", () => {
    expect(extractEmailDomain("Ada@Analytic.Example")).toBe("analytic.example");
  });

  it("handles whitespace around the input", () => {
    expect(extractEmailDomain("  ada@x.test  ")).toBe("x.test");
  });

  it("returns null for null/undefined/empty", () => {
    expect(extractEmailDomain(null)).toBeNull();
    expect(extractEmailDomain(undefined)).toBeNull();
    expect(extractEmailDomain("")).toBeNull();
    expect(extractEmailDomain("   ")).toBeNull();
  });

  it("returns null when there's no @ sign", () => {
    expect(extractEmailDomain("not-an-email")).toBeNull();
  });

  it("returns null when there's nothing after the @", () => {
    expect(extractEmailDomain("ada@")).toBeNull();
  });

  it("returns null when the domain has no dot", () => {
    expect(extractEmailDomain("ada@localhost")).toBeNull();
  });

  it("uses the last @ for emails with embedded @ in the local part", () => {
    // RFC 5321 allows quoted local parts with @ inside; rare but handle it.
    expect(extractEmailDomain('"weird@local"@example.com')).toBe(
      "example.com",
    );
  });

  it("returns null when the domain contains whitespace", () => {
    expect(extractEmailDomain("ada@bad domain.com")).toBeNull();
  });
});

describe("isFreeEmailDomain", () => {
  it("identifies common providers as free", () => {
    expect(isFreeEmailDomain("gmail.com")).toBe(true);
    expect(isFreeEmailDomain("YAHOO.COM")).toBe(true);
    expect(isFreeEmailDomain("icloud.com")).toBe(true);
    expect(isFreeEmailDomain("proton.me")).toBe(true);
  });

  it("rejects ordinary corporate domains", () => {
    expect(isFreeEmailDomain("fitwellbuckle.co")).toBe(false);
    expect(isFreeEmailDomain("mhp-horlogerie.fr")).toBe(false);
  });

  it("returns false for null/empty", () => {
    expect(isFreeEmailDomain(null)).toBe(false);
    expect(isFreeEmailDomain("")).toBe(false);
  });
});

describe("companyEmailDomain", () => {
  it("returns the domain for a corporate email", () => {
    expect(companyEmailDomain("ada@analytic.example")).toBe(
      "analytic.example",
    );
  });

  it("returns null for free providers", () => {
    expect(companyEmailDomain("personal@gmail.com")).toBeNull();
    expect(companyEmailDomain("u@yahoo.co.uk")).toBeNull();
  });

  it("returns null for invalid emails", () => {
    expect(companyEmailDomain(null)).toBeNull();
    expect(companyEmailDomain("not-an-email")).toBeNull();
  });
});
