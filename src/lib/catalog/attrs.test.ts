import { describe, it, expect } from "vitest";
import { deriveAttrs } from "@/lib/catalog/attrs";

describe("deriveAttrs", () => {
  it("reads size + colour + material from Size/Material/Colour options", () => {
    expect(
      deriveAttrs(
        ["Size", "Material", "Color"],
        ["16mm Width", "316L Stainless Steel", "Black"],
      ),
    ).toEqual({ sizeMm: 16, color: "Black", material: "316L Stainless Steel" });
  });

  it("keeps a colour value that contains a slash intact", () => {
    expect(
      deriveAttrs(
        ["Size", "Material", "Color"],
        ["20mm Width", "316L Stainless Steel", "Silver Brushed / Polished"],
      ),
    ).toEqual({
      sizeMm: 20,
      color: "Silver Brushed / Polished",
      material: "316L Stainless Steel",
    });
  });

  it("reads Titanium material", () => {
    expect(
      deriveAttrs(["Size", "Material", "Color"], ["18mm Width", "Titanium", "Black"]),
    ).toEqual({ sizeMm: 18, color: "Black", material: "Titanium" });
  });

  it("handles a colour-only bundle (no size)", () => {
    expect(deriveAttrs(["Color"], ["Rose gold"])).toEqual({
      sizeMm: null,
      color: "Rose gold",
      material: null,
    });
  });

  it("does not mistake material for size", () => {
    const r = deriveAttrs(["Material", "Color"], ["316L Stainless Steel", "Black"]);
    expect(r.sizeMm).toBeNull();
    expect(r.color).toBe("Black");
    expect(r.material).toBe("316L Stainless Steel");
  });

  it("falls back to a 'NNmm' value when there's no Size-named option", () => {
    expect(deriveAttrs(["Width", "Color"], ["18mm", "Silver"])).toEqual({
      sizeMm: 18,
      color: "Silver",
      material: null,
    });
  });

  it("returns nulls for a non-variant product", () => {
    expect(deriveAttrs(["Title"], ["Default Title"])).toEqual({
      sizeMm: null,
      color: null,
      material: null,
    });
  });

  it("ignores empty option slots", () => {
    expect(deriveAttrs(["Size", "Material", "Color"], ["16mm Width", null, undefined])).toEqual(
      { sizeMm: 16, color: null, material: null },
    );
  });
});
