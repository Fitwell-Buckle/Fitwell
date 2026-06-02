import { describe, expect, it } from "vitest";
import { buildReplyQuery, buildSentQuery } from "@/lib/gmail/reply-query";

describe("buildReplyQuery", () => {
  it("builds a from:+after: query using epoch seconds (precise dedup)", () => {
    const since = new Date("2026-01-05T12:34:56Z");
    const epoch = Math.floor(since.getTime() / 1000);
    expect(buildReplyQuery("ada@x.test", since)).toBe(
      `from:ada@x.test after:${epoch}`,
    );
  });

  it("clamps a pre-epoch date to 0", () => {
    expect(buildReplyQuery("g@h.test", new Date(0))).toBe("from:g@h.test after:0");
  });
});

describe("buildSentQuery", () => {
  it("scopes to the Sent mailbox and the recipient", () => {
    expect(buildSentQuery("ada@x.test")).toBe("in:sent to:ada@x.test");
  });
});
