import { describe, it, expect } from "vitest";
import {
  canonicalPoNumber,
  namedPoNumbers,
  isAboutAnotherPo,
} from "./po-email-filter";

describe("canonicalPoNumber", () => {
  it("reduces assorted PO formats to bare digits", () => {
    expect(canonicalPoNumber("PO-00104")).toBe("104");
    expect(canonicalPoNumber("PO00104")).toBe("104");
    expect(canonicalPoNumber("104")).toBe("104");
    expect(canonicalPoNumber("00104")).toBe("104");
  });

  it("returns null when there are no digits", () => {
    expect(canonicalPoNumber(null)).toBeNull();
    expect(canonicalPoNumber(undefined)).toBeNull();
    expect(canonicalPoNumber("draft")).toBeNull();
  });
});

describe("namedPoNumbers", () => {
  it("extracts PO numbers across spellings", () => {
    expect([...namedPoNumbers("Fitwell order PO #14")]).toEqual(["14"]);
    expect([...namedPoNumbers("see PO-00104 attached")]).toEqual(["104"]);
    expect([...namedPoNumbers("ref PO00104")]).toEqual(["104"]);
    expect([...namedPoNumbers("P.O. 104")]).toEqual(["104"]);
    expect([...namedPoNumbers("the purchase order 14 is late")]).toEqual([
      "14",
    ]);
  });

  it("does not treat buckle SKUs or stray words as PO numbers", () => {
    expect(namedPoNumbers("50x FWB001-BL-20 and 50x FWB001-RG-20").size).toBe(0);
    expect(namedPoNumbers("Apollo 14 deposit report").size).toBe(0);
  });

  it("collects every PO named in the text", () => {
    expect([...namedPoNumbers("like PO #104 but unlike PO #14")].sort()).toEqual(
      ["104", "14"],
    );
  });
});

describe("isAboutAnotherPo", () => {
  const mine = new Set(["104"]);

  it("drops an email that names only a different PO", () => {
    // The screenshot case: a 'PO #14' thread surfaced on PO-00104 by a shared SKU.
    expect(
      isAboutAnotherPo(
        "Re: Re: Fitwell order PO #14\nHi Marcus, 50x FWB001-BL-20 added.",
        mine,
      ),
    ).toBe(true);
  });

  it("keeps an email that names our PO", () => {
    expect(isAboutAnotherPo("Fitwell order PO #104", mine)).toBe(false);
    expect(isAboutAnotherPo("see PO-00104 attached", mine)).toBe(false);
  });

  it("keeps an email that names ours alongside another PO", () => {
    expect(isAboutAnotherPo("PO #104 — replaces PO #14", mine)).toBe(false);
  });

  it("keeps an email that names no PO (SKU-only match)", () => {
    expect(
      isAboutAnotherPo("Quote for FWB001-BL-20 buckles, 100 units", mine),
    ).toBe(false);
  });
});
