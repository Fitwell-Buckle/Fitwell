import { describe, expect, it } from "vitest";
import {
  decodeB64Url,
  extractPlainText,
  formatTranscript,
} from "./transcript";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

describe("extractPlainText", () => {
  it("reads a direct text/plain body", () => {
    expect(
      extractPlainText({ mimeType: "text/plain", body: { data: b64("hello") } }),
    ).toBe("hello");
  });
  it("prefers text/plain inside multipart", () => {
    expect(
      extractPlainText({
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/html", body: { data: b64("<p>hi</p>") } },
          { mimeType: "text/plain", body: { data: b64("hi plain") } },
        ],
      }),
    ).toBe("hi plain");
  });
  it("returns empty when no text part", () => {
    expect(extractPlainText({ mimeType: "image/png" })).toBe("");
    expect(extractPlainText(undefined)).toBe("");
  });
});

describe("formatTranscript", () => {
  it("orders oldest→newest, labels sender+date, strips quotes", () => {
    const out = formatTranscript([
      {
        from: "Aurore <a@x.test>",
        dateMs: Date.parse("2026-04-22T00:00:00Z"),
        text: "thanks\n> your earlier line\nOn Mon someone wrote:\nold stuff",
      },
      {
        from: "Oliver <o@x.test>",
        dateMs: Date.parse("2026-04-21T00:00:00Z"),
        text: "Hi Aurore, samples?",
      },
    ]);
    // Oliver (Apr 21) comes before Aurore (Apr 22)
    expect(out.indexOf("Oliver")).toBeLessThan(out.indexOf("Aurore"));
    expect(out).toContain("Hi Aurore, samples?");
    expect(out).toContain("thanks");
    expect(out).not.toContain("your earlier line"); // quoted line dropped
    expect(out).not.toContain("old stuff"); // after "On … wrote:" dropped
  });
  it("truncates to the most recent maxChars", () => {
    const out = formatTranscript(
      [{ from: "x", dateMs: 1, text: "a".repeat(500) }],
      100,
    );
    expect(out.length).toBeLessThanOrEqual(104); // 100 + "…\n\n"
    expect(out.startsWith("…")).toBe(true);
  });
});

describe("decodeB64Url", () => {
  it("round-trips", () => {
    expect(decodeB64Url(b64("café ☕"))).toBe("café ☕");
  });
});
