import { describe, expect, it } from "vitest";
import {
  approvePrototype,
  isActivePrototypeStatus,
  nextRoundNumber,
} from "./prototypes";

describe("approvePrototype", () => {
  const now = new Date("2026-06-22T12:00:00Z");

  it("rejects approval with no final SKU", () => {
    const res = approvePrototype({ status: "in_development" }, now);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/final SKU/i);
  });

  it("rejects approval with a blank/whitespace final SKU", () => {
    const res = approvePrototype({ status: "in_development", finalSku: "   " }, now);
    expect(res.ok).toBe(false);
  });

  it("approves with a final SKU, trims it, and stamps approvedAt", () => {
    const res = approvePrototype(
      { status: "in_development", finalSku: "  FW-TI-002  " },
      now,
    );
    expect(res.ok).toBe(true);
    expect(res.fields).toEqual({
      status: "approved",
      finalSku: "FW-TI-002",
      approvedAt: now,
    });
  });
});

describe("isActivePrototypeStatus", () => {
  it("treats concept/in_development/on_hold as active", () => {
    expect(isActivePrototypeStatus("concept")).toBe(true);
    expect(isActivePrototypeStatus("in_development")).toBe(true);
    expect(isActivePrototypeStatus("on_hold")).toBe(true);
  });

  it("treats approved/rejected as terminal", () => {
    expect(isActivePrototypeStatus("approved")).toBe(false);
    expect(isActivePrototypeStatus("rejected")).toBe(false);
  });
});

describe("nextRoundNumber", () => {
  it("starts at 1 with no rounds", () => {
    expect(nextRoundNumber([])).toBe(1);
  });

  it("returns max + 1 (not count + 1) so deleted rounds don't collide", () => {
    expect(nextRoundNumber([{ roundNumber: 1 }, { roundNumber: 3 }])).toBe(4);
  });
});
