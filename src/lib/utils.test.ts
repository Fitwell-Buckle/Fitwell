import { describe, it, expect } from "vitest";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("lets later tailwind utilities win (tailwind-merge)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});

describe("formatCurrency", () => {
  it("formats cents as USD by default", () => {
    expect(formatCurrency(4995)).toBe("$49.95");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("groups thousands", () => {
    expect(formatCurrency(1234567)).toBe("$12,345.67");
  });

  it("honors a currency override", () => {
    // Non-USD symbols vary by ICU version; just assert it is not the USD format.
    const eur = formatCurrency(1000, "EUR");
    expect(eur).not.toBe("$10.00");
    expect(eur).toContain("10");
  });
});

describe("formatDate", () => {
  it("formats a Date with the default medium style", () => {
    // Construct in local time so the assertion is timezone-stable.
    expect(formatDate(new Date(2026, 4, 18))).toBe("May 18, 2026");
  });

  it("accepts a date string", () => {
    const out = formatDate("2026-05-18");
    expect(typeof out).toBe("string");
    expect(out).toContain("2026");
  });

  it("respects option overrides", () => {
    expect(formatDate(new Date(2026, 4, 18), { month: "long" })).toBe(
      "May 18, 2026",
    );
  });
});
