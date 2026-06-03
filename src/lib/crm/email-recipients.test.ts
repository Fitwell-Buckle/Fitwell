import { describe, expect, it } from "vitest";
import {
  invalidRecipients,
  isValidRecipientList,
  normalizeRecipients,
  splitRecipients,
} from "./email-recipients";

describe("splitRecipients", () => {
  it("returns [] for null/undefined/blank", () => {
    expect(splitRecipients(null)).toEqual([]);
    expect(splitRecipients(undefined)).toEqual([]);
    expect(splitRecipients("   ")).toEqual([]);
  });

  it("splits on commas and semicolons and trims", () => {
    expect(splitRecipients("a@x.com, b@y.com; c@z.com")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
  });

  it("drops empty segments", () => {
    expect(splitRecipients("a@x.com,, ,b@y.com")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });
});

describe("invalidRecipients / isValidRecipientList", () => {
  it("treats an empty list as valid", () => {
    expect(invalidRecipients("")).toEqual([]);
    expect(isValidRecipientList(null)).toBe(true);
    expect(isValidRecipientList("  ")).toBe(true);
  });

  it("flags malformed addresses", () => {
    expect(invalidRecipients("good@x.com, nope, also bad")).toEqual([
      "nope",
      "also bad",
    ]);
    expect(isValidRecipientList("good@x.com, nope")).toBe(false);
  });

  it("accepts a clean list", () => {
    expect(isValidRecipientList("a@x.com, b@y.com")).toBe(true);
  });
});

describe("normalizeRecipients", () => {
  it("returns null for blank", () => {
    expect(normalizeRecipients("")).toBeNull();
    expect(normalizeRecipients(null)).toBeNull();
    expect(normalizeRecipients(" ; , ")).toBeNull();
  });

  it("comma-joins and trims", () => {
    expect(normalizeRecipients("a@x.com;b@y.com")).toBe("a@x.com, b@y.com");
  });

  it("de-duplicates case-insensitively, keeping the first spelling", () => {
    expect(normalizeRecipients("Greg@x.com, greg@x.com, b@y.com")).toBe(
      "Greg@x.com, b@y.com",
    );
  });
});
