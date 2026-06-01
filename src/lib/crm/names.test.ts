import { describe, expect, it } from "vitest";
import { toNameCase } from "@/lib/crm/names";

describe("toNameCase", () => {
  it("lowercases an all-caps surname", () => {
    expect(toNameCase("PALMER")).toBe("Palmer");
  });

  it("capitalizes an all-lowercase name", () => {
    expect(toNameCase("fabien")).toBe("Fabien");
  });

  it("fixes mixed/odd casing", () => {
    expect(toNameCase("fABIEN")).toBe("Fabien");
  });

  it("handles hyphenated names", () => {
    expect(toNameCase("jean-pierre")).toBe("Jean-Pierre");
    expect(toNameCase("KING-NOEL")).toBe("King-Noel");
  });

  it("handles apostrophes", () => {
    expect(toNameCase("o'brien")).toBe("O'Brien");
    expect(toNameCase("D'ANGELO")).toBe("D'Angelo");
  });

  it("handles multi-word names and collapses whitespace", () => {
    expect(toNameCase("mary  jane")).toBe("Mary Jane");
    expect(toNameCase("  van  der  berg ")).toBe("Van Der Berg");
  });

  it("preserves and cases accented characters", () => {
    expect(toNameCase("renée")).toBe("Renée");
    expect(toNameCase("ÉTIENNE")).toBe("Étienne");
    expect(toNameCase("frédéric")).toBe("Frédéric");
  });

  it("returns null for null/undefined/empty/whitespace", () => {
    expect(toNameCase(null)).toBeNull();
    expect(toNameCase(undefined)).toBeNull();
    expect(toNameCase("")).toBeNull();
    expect(toNameCase("   ")).toBeNull();
  });

  it("is idempotent on already-correct names", () => {
    expect(toNameCase("Fabien")).toBe("Fabien");
    expect(toNameCase("Jean-Pierre")).toBe("Jean-Pierre");
  });
});
