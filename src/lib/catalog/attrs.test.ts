import { describe, it, expect } from "vitest";
import { deriveAttrs } from "@/lib/catalog/attrs";

describe("deriveAttrs", () => {
  it("reads size + colour from Size/Material/Colour options", () => {
    expect(
      deriveAttrs(
        ["Size", "Material", "Color"],
        ["16mm Width", "316L Stainless Steel", "Black"],
      ),
    ).toEqual({ sizeMm: 16, color: "Black" });
  });

  it("keeps a colour value that contains a slash intact", () => {
    expect(
      deriveAttrs(
        ["Size", "Material", "Color"],
        ["20mm Width", "316L Stainless Steel", "Silver Brushed / Polished"],
      ),
    ).toEqual({ sizeMm: 20, color: "Silver Brushed / Polished" });
  });

  it("handles a colour-only bundle (no size)", () => {
    expect(deriveAttrs(["Color"], ["Rose gold"])).toEqual({
      sizeMm: null,
      color: "Rose gold",
    });
  });

  it("does not mistake material for size", () => {
    const r = deriveAttrs(["Material", "Color"], ["316L Stainless Steel", "Black"]);
    expect(r.sizeMm).toBeNull();
    expect(r.color).toBe("Black");
  });

  it("falls back to a 'NNmm' value when there's no Size-named option", () => {
    expect(deriveAttrs(["Width", "Color"], ["18mm", "Silver"])).toEqual({
      sizeMm: 18,
      color: "Silver",
    });
  });

  it("returns nulls for a non-variant product", () => {
    expect(deriveAttrs(["Title"], ["Default Title"])).toEqual({
      sizeMm: null,
      color: null,
    });
  });

  it("ignores empty option slots", () => {
    expect(deriveAttrs(["Size", "Material", "Color"], ["16mm Width", null, undefined])).toEqual(
      { sizeMm: 16, color: null },
    );
  });
});
