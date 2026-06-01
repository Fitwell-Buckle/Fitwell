import { describe, expect, it } from "vitest";
import { formatAddress } from "./address";

const empty = {
  addressLine1: null,
  addressLine2: null,
  city: null,
  region: null,
  postalCode: null,
  country: null,
};

describe("formatAddress", () => {
  it("returns null when no part is set", () => {
    expect(formatAddress(empty)).toBeNull();
  });

  it("joins city, region and postal code onto one line", () => {
    expect(
      formatAddress({
        ...empty,
        addressLine1: "123 Market St",
        city: "San Francisco",
        region: "CA",
        postalCode: "94103",
        country: "United States",
      }),
    ).toBe("123 Market St\nSan Francisco, CA, 94103\nUnited States");
  });

  it("keeps line 2 between the street and city lines", () => {
    expect(
      formatAddress({
        ...empty,
        addressLine1: "1 Infinite Loop",
        addressLine2: "Suite 5",
        city: "Cupertino",
      }),
    ).toBe("1 Infinite Loop\nSuite 5\nCupertino");
  });

  it("handles a foreign address with no region/postal", () => {
    expect(
      formatAddress({
        ...empty,
        addressLine1: "10 Downing Street",
        city: "London",
        postalCode: "SW1A 2AA",
        country: "United Kingdom",
      }),
    ).toBe("10 Downing Street\nLondon, SW1A 2AA\nUnited Kingdom");
  });

  it("skips blank/whitespace-only parts", () => {
    expect(
      formatAddress({
        ...empty,
        addressLine1: "  ",
        city: "Berlin",
        country: "Germany",
      }),
    ).toBe("Berlin\nGermany");
  });
});
