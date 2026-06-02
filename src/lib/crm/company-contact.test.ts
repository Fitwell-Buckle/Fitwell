import { describe, expect, it } from "vitest";
import { resolveCompanyContact, type ContactPerson } from "./company-contact";

const free = { contactName: "Old Free", contactEmail: "old@x.test" };
const noFree = { contactName: null, contactEmail: null };
const ada: ContactPerson = {
  kind: "lead",
  id: "l1",
  label: "Ada Lovelace",
  email: "ada@x.test",
};
const bob: ContactPerson = {
  kind: "customer",
  id: "c1",
  label: "Bob Stone",
  email: "bob@x.test",
};

describe("resolveCompanyContact", () => {
  it("uses the designated primary person (matching kind+id)", () => {
    const r = resolveCompanyContact(
      { ...free, primaryContactKind: "customer", primaryContactId: "c1" },
      [ada, bob],
    );
    expect(r).toEqual({ name: "Bob Stone", email: "bob@x.test", source: "primary" });
  });

  it("uses the single attached person when there's exactly one", () => {
    const r = resolveCompanyContact(
      { ...free, primaryContactKind: null, primaryContactId: null },
      [ada],
    );
    expect(r).toEqual({ name: "Ada Lovelace", email: "ada@x.test", source: "only" });
  });

  it("falls back to free-text with multiple people and no primary", () => {
    const r = resolveCompanyContact(
      { ...free, primaryContactKind: null, primaryContactId: null },
      [ada, bob],
    );
    expect(r).toEqual({ name: "Old Free", email: "old@x.test", source: "free_text" });
  });

  it("falls back to free-text when no one is attached", () => {
    const r = resolveCompanyContact(
      { ...free, primaryContactKind: null, primaryContactId: null },
      [],
    );
    expect(r.source).toBe("free_text");
  });

  it("returns none when nothing is set", () => {
    const r = resolveCompanyContact(
      { ...noFree, primaryContactKind: null, primaryContactId: null },
      [],
    );
    expect(r).toEqual({ name: null, email: null, source: "none" });
  });

  it("ignores a stale primary pointer that no longer matches a person", () => {
    const r = resolveCompanyContact(
      { ...noFree, primaryContactKind: "lead", primaryContactId: "gone" },
      [bob],
    );
    // Only one person left → that person.
    expect(r).toEqual({ name: "Bob Stone", email: "bob@x.test", source: "only" });
  });
});
