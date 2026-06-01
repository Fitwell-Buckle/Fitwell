import { describe, expect, it } from "vitest";
import {
  matchCustomerSender,
  parseDisplayName,
  parseEmailAddress,
  type CustomerEmailIndex,
} from "./customer-match";

const index: CustomerEmailIndex = {
  companyByEmail: new Map([["buyer@acme.com", "co_1"]]),
  customerByEmail: new Map([["jane@gmail.com", "cust_1"], ["buyer@acme.com", "cust_9"]]),
};

describe("parseEmailAddress", () => {
  it("extracts from a Name <email> header", () => {
    expect(parseEmailAddress("Jane Doe <Jane@Gmail.com>")).toBe("jane@gmail.com");
  });
  it("accepts a bare address", () => {
    expect(parseEmailAddress("buyer@acme.com")).toBe("buyer@acme.com");
  });
  it("returns null for junk", () => {
    expect(parseEmailAddress("not an email")).toBeNull();
    expect(parseEmailAddress("")).toBeNull();
  });
});

describe("parseDisplayName", () => {
  it("pulls the name before the angle brackets", () => {
    expect(parseDisplayName("Jane Doe <jane@gmail.com>")).toBe("Jane Doe");
  });
  it("strips surrounding quotes", () => {
    expect(parseDisplayName('"Acme, Inc." <buyer@acme.com>')).toBe("Acme, Inc.");
  });
  it("returns null for a bare address", () => {
    expect(parseDisplayName("jane@gmail.com")).toBeNull();
  });
});

describe("matchCustomerSender", () => {
  it("matches a company contact as B2B (wins over a customer row)", () => {
    const m = matchCustomerSender("Buyer <buyer@acme.com>", index);
    expect(m).toMatchObject({ audience: "b2b", companyId: "co_1", customerId: null });
  });
  it("matches a consumer customer", () => {
    const m = matchCustomerSender("Jane <jane@gmail.com>", index);
    expect(m).toMatchObject({ audience: "consumer", customerId: "cust_1", companyId: null });
  });
  it("returns null for an unknown sender", () => {
    expect(matchCustomerSender("stranger@nowhere.com", index)).toBeNull();
  });
  it("is case-insensitive on the address", () => {
    expect(matchCustomerSender("JANE@GMAIL.COM", index)?.customerId).toBe("cust_1");
  });
});
