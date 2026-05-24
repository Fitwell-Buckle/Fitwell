import { describe, it, expect } from "vitest";
import { canMagicLinkSignIn } from "@/lib/supplier-access";

describe("canMagicLinkSignIn", () => {
  it("allows an email that resolves to a supplier", () => {
    expect(canMagicLinkSignIn("supplier-123", false)).toBe(true);
  });

  it("allows an allowed admin even without a supplier match", () => {
    expect(canMagicLinkSignIn(null, true)).toBe(true);
    expect(canMagicLinkSignIn(undefined, true)).toBe(true);
  });

  it("denies an email that is neither a supplier nor an allowed admin", () => {
    expect(canMagicLinkSignIn(null, false)).toBe(false);
    expect(canMagicLinkSignIn(undefined, false)).toBe(false);
    expect(canMagicLinkSignIn("", false)).toBe(false);
  });

  it("allows when both conditions are true", () => {
    expect(canMagicLinkSignIn("supplier-123", true)).toBe(true);
  });
});
