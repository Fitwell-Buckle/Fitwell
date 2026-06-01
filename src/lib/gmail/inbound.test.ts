import { describe, expect, it } from "vitest";
import { buildReplyQuery } from "@/lib/gmail/reply-query";

describe("buildReplyQuery", () => {
  it("builds a from:+after: query with zero-padded YYYY/MM/DD", () => {
    expect(buildReplyQuery("ada@x.test", new Date(2026, 0, 5))).toBe(
      "from:ada@x.test after:2026/01/05",
    );
  });

  it("pads double-digit months/days correctly", () => {
    expect(buildReplyQuery("g@h.test", new Date(2026, 10, 23))).toBe(
      "from:g@h.test after:2026/11/23",
    );
  });
});
