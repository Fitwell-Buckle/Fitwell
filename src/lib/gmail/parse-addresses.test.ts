import { describe, it, expect } from "vitest";
import { parseAddressList } from "./parse-addresses";

describe("parseAddressList", () => {
  it("parses a bare email", () => {
    expect(parseAddressList("alice@example.com")).toEqual([
      { email: "alice@example.com", name: null },
    ]);
  });

  it("parses Name <email>", () => {
    expect(parseAddressList("Alice <alice@example.com>")).toEqual([
      { email: "alice@example.com", name: "Alice" },
    ]);
  });

  it('parses "Quoted Name" <email>', () => {
    expect(parseAddressList('"Alice Smith" <alice@example.com>')).toEqual([
      { email: "alice@example.com", name: "Alice Smith" },
    ]);
  });

  it("parses multiple comma-separated addresses", () => {
    const r = parseAddressList(
      'Alice <a@x.com>, "Bob, Jr." <b@x.com>, c@x.com',
    );
    expect(r).toEqual([
      { email: "a@x.com", name: "Alice" },
      { email: "b@x.com", name: "Bob, Jr." },
      { email: "c@x.com", name: null },
    ]);
  });

  it("ignores commas inside quoted names", () => {
    const r = parseAddressList('"Last, First" <person@x.com>');
    expect(r).toEqual([{ email: "person@x.com", name: "Last, First" }]);
  });

  it("returns [] for empty / malformed input", () => {
    expect(parseAddressList("")).toEqual([]);
    expect(parseAddressList("   ")).toEqual([]);
    expect(parseAddressList("not an email")).toEqual([]);
  });
});
