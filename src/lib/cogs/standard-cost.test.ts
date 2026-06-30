import { describe, it, expect } from "vitest";
import { standardUnitCostCents, detectMaterial } from "./standard-cost";

// All examples are real (sku, title, variant) tuples from the prod catalog.
const C = (sku: string, title: string, variant: string) =>
  standardUnitCostCents(title, variant, sku);

describe("standardUnitCostCents", () => {
  it("prices stainless buckles at $3.60 across every finish", () => {
    expect(C("FWB001-SS-18", "Fitwell Model One Stainless", "18mm / 316L Stainless Steel / Natural (silver)")).toBe(360);
    expect(C("FWB001-YG-16", "Fitwell Model One Yellow Gold", "16mm / 316L Stainless Steel / Yellow Gold")).toBe(360);
    expect(C("FWB001-RG-18", "Fitwell Model One Rose Gold", "18mm / 316L Stainless Steel / Rose Gold")).toBe(360);
    expect(C("FWB001-BL-20", "Fitwell Model One Black", "20mm / 316L Stainless Steel / Black")).toBe(360);
    expect(C("FWB001-SB-18", "Fitwell Model One Bead Blast", "18mm / 316L Stainless Steel / Natural (silver) Bead Blasted")).toBe(360);
    expect(C("FWB004-SS-22", "Fitwell M4 Universal Micro-Adjust", "22mm / 316L Stainless Steel / Silver")).toBe(360);
    expect(C("FWOE002-M1-SS-18", "OEM Junghans M1", "18mm / 316L Stainless Steel / Silver Brushed")).toBe(360);
  });

  it("prices titanium buckles at $4.50 (incl. bead-blasted titanium)", () => {
    expect(C("FWB001-TI-16", "Fitwell Model One Titanium", "16mm / Titanium / Natural (silver)")).toBe(450);
    expect(C("FWB001-TB-18", "Fitwell Model One Bead Blast", "18mm / Titanium / Natural (silver) Bead Blasted")).toBe(450);
    expect(C("FWOE004-M1-TI-18", "OEM Dufrane M1", "18mm / Titanium / Silver Brushed")).toBe(450);
  });

  it("uses the TITLE to tell a bead-blast buckle from a spring bar (same-ish code)", () => {
    // FWB001SB18 is a bead-blast BUCKLE; FWB001SB20 is a SPRING BAR.
    expect(C("FWB001SB18", "Fitwell Model One Bead Blast", "18mm / 316L Stainless Steel / Natural (silver) Bead Blasted")).toBe(360);
    expect(C("FWB001SB20", "Fitwell Model One Spring Bar", "For 20mm Buckle")).toBe(1);
  });

  it("prices spring bars at $0.01", () => {
    expect(C("FWBA001SB-16", "Fitwell Spring Bar", "For 16mm Buckle or Link")).toBe(1);
    expect(C("FWB001SB16", "Fitwell Model One Spring Bar", "For 16mm Buckle")).toBe(1);
  });

  it("prices tangs at $1.00 — even titanium ones (a tang is not a buckle)", () => {
    expect(C("FWBA001TW-SS", "Wide 2.25mm Tang for Fitwell", "Silver / 316L Stainless Steel")).toBe(100);
    expect(C("FWBA001TW-TI", "Wide 2.25mm Tang for Fitwell", "Silver / Titanium")).toBe(100);
    expect(C("FWBA-T225-SS", "Wide 2.25mm Tang for Fitwell", "Natural (silver) / 316L Stainless Steel")).toBe(100);
    expect(C("", "Replacement Tang for Fitwell", "Silver / 316L Stainless Steel")).toBe(100);
  });

  it("prices bundles at 3× the blended buckle cost, inferring material from the code", () => {
    // Bundle variants read just a colour ("Silver"), so material comes from -SS-.
    expect(C("FWB004-SS-BUN", "Fitwell M4 Universal Micro-Adjust", "Silver")).toBe(1080);
    expect(C("FWB001-SS-BUN", "Fitwell M1 Micro-Adjust Buckle", "Silver")).toBe(1080);
    expect(C("FWB004-BL-BUN", "Fitwell M4 Universal Micro-Adjust", "Black")).toBe(1080);
  });

  it("returns null when nothing identifies the product", () => {
    expect(C("MYSTERY-1", "Gift Card", "Digital")).toBeNull();
  });

  it("detectMaterial falls back to the sku finish code when text has no material word", () => {
    expect(detectMaterial("Fitwell M4 Universal", "Silver", "FWB004-SS-BUN")).toBe("stainless");
    expect(detectMaterial("OEM", "Polished", "FWOE002-M1-TI-18")).toBe("titanium");
    expect(detectMaterial("Gift Card", "Digital", "GC-100")).toBeNull();
  });
});
