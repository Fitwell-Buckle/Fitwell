import { describe, it, expect } from "vitest";
import { classifyChannel } from "@/lib/orders/channel";

describe("classifyChannel", () => {
  it("classifies only web as d2c", () => {
    expect(classifyChannel("web", false)).toBe("d2c");
  });

  it("classifies POS as tradeshow", () => {
    expect(classifyChannel("pos", false)).toBe("tradeshow");
  });

  it("classifies draft orders as b2b (wholesale/OEM convert from drafts)", () => {
    expect(classifyChannel("shopify_draft_order", false)).toBe("b2b");
  });

  it("treats any other / app / NULL source as b2b (not POS, not online store)", () => {
    expect(classifyChannel("3890849", false)).toBe("b2b"); // an app/channel id
    expect(classifyChannel(null, false)).toBe("b2b");
    expect(classifyChannel(undefined, false)).toBe("b2b");
  });

  it("sample takes precedence over every source_name", () => {
    expect(classifyChannel("shopify_draft_order", true)).toBe("sample");
    expect(classifyChannel("web", true)).toBe("sample");
    expect(classifyChannel("pos", true)).toBe("sample");
    expect(classifyChannel(null, true)).toBe("sample");
  });
});
