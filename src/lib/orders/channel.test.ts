import { describe, it, expect } from "vitest";
import { classifyChannel } from "@/lib/orders/channel";

describe("classifyChannel", () => {
  it("classifies wholesale draft orders as b2b", () => {
    expect(classifyChannel("shopify_draft_order", false)).toBe("b2b");
  });

  it("classifies POS as tradeshow", () => {
    expect(classifyChannel("pos", false)).toBe("tradeshow");
  });

  it("classifies web as d2c", () => {
    expect(classifyChannel("web", false)).toBe("d2c");
  });

  it("treats NULL/legacy source_name as d2c", () => {
    expect(classifyChannel(null, false)).toBe("d2c");
    expect(classifyChannel(undefined, false)).toBe("d2c");
    expect(classifyChannel("some_future_source", false)).toBe("d2c");
  });

  it("sample takes precedence over every source_name", () => {
    expect(classifyChannel("shopify_draft_order", true)).toBe("sample");
    expect(classifyChannel("web", true)).toBe("sample");
    expect(classifyChannel("pos", true)).toBe("sample");
    expect(classifyChannel(null, true)).toBe("sample");
  });
});
