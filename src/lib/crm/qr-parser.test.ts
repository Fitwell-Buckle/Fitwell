import { describe, expect, it } from "vitest";
import { parseQrPayload } from "@/lib/crm/qr-parser";

describe("parseQrPayload — vCard", () => {
  it("parses a typical vCard 3.0 payload", () => {
    const vcard =
      "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada Lovelace\r\nN:Lovelace;Ada;;;\r\nORG:Analytical Engines;R&D\r\nTITLE:Chief Engineer\r\nEMAIL;TYPE=WORK:ada@analytic.example\r\nTEL;TYPE=CELL:+44 20 7946 0000\r\nURL:https://analytic.example\r\nEND:VCARD";
    expect(parseQrPayload(vcard)).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@analytic.example",
      phone: "+44 20 7946 0000",
      title: "Chief Engineer",
      companyName: "Analytical Engines",
      website: "https://analytic.example",
    });
  });

  it("uses FN when N is absent", () => {
    const vcard = "BEGIN:VCARD\nFN:Grace Hopper\nEND:VCARD";
    expect(parseQrPayload(vcard)).toMatchObject({
      firstName: "Grace",
      lastName: "Hopper",
    });
  });

  it("FN with a single token becomes the first name", () => {
    const vcard = "BEGIN:VCARD\nFN:Cher\nEND:VCARD";
    expect(parseQrPayload(vcard)).toMatchObject({
      firstName: "Cher",
      lastName: null,
    });
  });

  it("handles folded continuation lines per RFC 6350 (long URL split)", () => {
    // Per RFC 6350, the CRLF + leading whitespace of a continuation are
    // both dropped on unfolding — the values join with no separator.
    const vcard =
      "BEGIN:VCARD\nFN:Ada\nURL:https://very-long.exampl\n e.com/profile/ada\nEND:VCARD";
    expect(parseQrPayload(vcard)).toMatchObject({
      firstName: "Ada",
      website: "https://very-long.example.com/profile/ada",
    });
  });

  it("honors escaped commas in ORG", () => {
    const vcard = "BEGIN:VCARD\nFN:Ada\nORG:Smith\\, Jr Inc\nEND:VCARD";
    expect(parseQrPayload(vcard)).toMatchObject({
      companyName: "Smith, Jr Inc",
    });
  });
});

describe("parseQrPayload — MeCard", () => {
  it("parses a typical MeCard payload", () => {
    const mecard =
      "MECARD:N:Lovelace,Ada;TEL:+442079460000;EMAIL:ada@analytic.example;ORG:Analytical;TITLE:Chief Engineer;URL:https://analytic.example;;";
    expect(parseQrPayload(mecard)).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@analytic.example",
      phone: "+442079460000",
      title: "Chief Engineer",
      companyName: "Analytical",
      website: "https://analytic.example",
    });
  });

  it("handles minimal MeCard with only name + email", () => {
    expect(parseQrPayload("MECARD:N:Hopper,Grace;EMAIL:grace@x.test;;")).toMatchObject({
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace@x.test",
    });
  });
});

describe("parseQrPayload — simple URI schemes", () => {
  it("parses mailto: into email", () => {
    expect(parseQrPayload("mailto:ada@x.test")).toMatchObject({
      email: "ada@x.test",
    });
  });

  it("strips mailto: query string", () => {
    expect(
      parseQrPayload("mailto:ada@x.test?subject=hi"),
    ).toMatchObject({ email: "ada@x.test" });
  });

  it("parses tel: into phone", () => {
    expect(parseQrPayload("tel:+442079460000")).toMatchObject({
      phone: "+442079460000",
    });
  });

  it("parses a plain https URL into website", () => {
    expect(parseQrPayload("https://example.com/me")).toMatchObject({
      website: "https://example.com/me",
    });
  });

  it("detects a naked email address", () => {
    expect(parseQrPayload("grace@example.com")).toMatchObject({
      email: "grace@example.com",
    });
  });
});

describe("parseQrPayload — unknown", () => {
  it("returns null for an empty payload", () => {
    expect(parseQrPayload("")).toBeNull();
    expect(parseQrPayload("   ")).toBeNull();
  });

  it("returns null for an unrecognized payload", () => {
    expect(parseQrPayload("hello world this is not a contact")).toBeNull();
  });
});
