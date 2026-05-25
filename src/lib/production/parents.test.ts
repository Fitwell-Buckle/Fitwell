import { describe, it, expect } from "vitest";
import { resolveParent } from "./parents";

describe("resolveParent", () => {
  it("accepts a PO-only parent", () => {
    expect(resolveParent({ poId: "po1" })).toEqual({
      ok: true,
      poId: "po1",
      lineItemId: null,
    });
  });

  it("accepts a line-item-only parent", () => {
    expect(resolveParent({ lineItemId: "li1" })).toEqual({
      ok: true,
      poId: null,
      lineItemId: "li1",
    });
  });

  it("rejects when both are set", () => {
    const r = resolveParent({ poId: "po1", lineItemId: "li1" });
    expect(r.ok).toBe(false);
  });

  it("rejects when neither is set", () => {
    expect(resolveParent({}).ok).toBe(false);
    expect(resolveParent({ poId: "", lineItemId: "" }).ok).toBe(false);
    expect(resolveParent({ poId: null, lineItemId: undefined }).ok).toBe(false);
  });
});
