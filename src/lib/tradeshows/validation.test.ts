import { describe, it, expect } from "vitest";
import {
  splitContactName,
  vendorToSupplierLeadInput,
  vendorToCustomerLeadInput,
  addVendorCommentSchema,
  type VendorForPromotion,
} from "./validation";

const baseVendor: VendorForPromotion = {
  companyName: "WOLF SUISSE",
  firstName: "Beat",
  lastName: "Geiser",
  email: "beat.geiser@wolf-suisse.com",
  phone: null,
  title: null,
  website: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  region: null,
  postalCode: null,
  country: null,
  category: "Metal Bracelets and Clasps",
  seedNotes: "Buckles and clasps mfg",
  notes: "Spoke at booth, keen on micro-adjust.",
  nextSteps: "Send sample pack",
  cardImageUrl: null,
  cardRawText: null,
  ocrConfidence: null,
};

describe("splitContactName", () => {
  it("splits first + last", () => {
    expect(splitContactName("Beat Geiser")).toEqual({
      firstName: "Beat",
      lastName: "Geiser",
    });
  });
  it("keeps multi-word surnames together", () => {
    expect(splitContactName("Jean Pierre De La Croix")).toEqual({
      firstName: "Jean",
      lastName: "Pierre De La Croix",
    });
  });
  it("treats a single token as a first name", () => {
    expect(splitContactName("Guillaume")).toEqual({
      firstName: "Guillaume",
      lastName: null,
    });
  });
  it("handles null / blank", () => {
    expect(splitContactName(null)).toEqual({
      firstName: null,
      lastName: null,
    });
    expect(splitContactName("   ")).toEqual({
      firstName: null,
      lastName: null,
    });
  });
});

describe("vendorToSupplierLeadInput", () => {
  it("maps company, contact, and category → supplierTypes", () => {
    const out = vendorToSupplierLeadInput(baseVendor, "EPHJ Geneva 2026");
    expect(out.companyName).toBe("WOLF SUISSE");
    expect(out.firstName).toBe("Beat");
    expect(out.lastName).toBe("Geiser");
    expect(out.email).toBe("beat.geiser@wolf-suisse.com");
    expect(out.supplierTypes).toEqual(["Metal Bracelets and Clasps"]);
  });
  it("rolls show context + notes + next steps into notes", () => {
    const out = vendorToSupplierLeadInput(baseVendor, "EPHJ Geneva 2026");
    expect(out.notes).toContain("Met at EPHJ Geneva 2026.");
    expect(out.notes).toContain("Buckles and clasps mfg");
    expect(out.notes).toContain("Spoke at booth");
    expect(out.notes).toContain("Next steps: Send sample pack");
  });
});

describe("addVendorCommentSchema", () => {
  it("trims and accepts a real note", () => {
    expect(addVendorCommentSchema.parse({ body: "  follow up next week " })).toEqual(
      { body: "follow up next week" },
    );
  });
  it("rejects an empty / whitespace-only note", () => {
    expect(addVendorCommentSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(addVendorCommentSchema.safeParse({ body: "" }).success).toBe(false);
  });
});

describe("vendorToCustomerLeadInput", () => {
  it("carries the show's source channel and omits stage (defaults to prospect)", () => {
    const out = vendorToCustomerLeadInput(
      baseVendor,
      "EPHJ Geneva 2026",
      "b2b_trade_shows_industry",
    );
    expect(out.sourceChannel).toBe("b2b_trade_shows_industry");
    expect("stage" in out).toBe(false);
    expect(out.companyName).toBe("WOLF SUISSE");
  });
});
