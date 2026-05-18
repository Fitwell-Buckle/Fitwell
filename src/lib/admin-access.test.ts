import { describe, it, expect } from "vitest";
import { isAllowedAdmin } from "@/lib/admin-access";

describe("isAllowedAdmin", () => {
  it("allows anyone when the allowlist is empty (local/dev)", () => {
    expect(isAllowedAdmin("anyone@example.com", [])).toBe(true);
    expect(isAllowedAdmin(null, [])).toBe(true);
    expect(isAllowedAdmin(undefined, [])).toBe(true);
  });

  it("allows an email that is on the allowlist", () => {
    expect(
      isAllowedAdmin("greg@fitwellbuckle.co", [
        "greg@fitwellbuckle.co",
        "ops@fitwellbuckle.co",
      ]),
    ).toBe(true);
  });

  it("denies an email that is not on the allowlist", () => {
    expect(
      isAllowedAdmin("attacker@evil.com", ["greg@fitwellbuckle.co"]),
    ).toBe(false);
  });

  it("denies null/undefined/empty email when an allowlist exists", () => {
    expect(isAllowedAdmin(null, ["greg@fitwellbuckle.co"])).toBe(false);
    expect(isAllowedAdmin(undefined, ["greg@fitwellbuckle.co"])).toBe(false);
    expect(isAllowedAdmin("", ["greg@fitwellbuckle.co"])).toBe(false);
  });

  it("is case-sensitive (mirrors the literal includes() check)", () => {
    // Documents current behavior: a casing mismatch is rejected. If we ever
    // want case-insensitive matching, change this test deliberately.
    expect(
      isAllowedAdmin("Greg@Fitwellbuckle.co", ["greg@fitwellbuckle.co"]),
    ).toBe(false);
  });
});
