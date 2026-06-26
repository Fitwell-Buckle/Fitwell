import { describe, it, expect } from "vitest";
import {
  iceScore,
  compareIdeasForList,
  isOpenIdeaStatus,
} from "./product-ideas";

describe("iceScore", () => {
  it("multiplies the three components", () => {
    expect(iceScore({ impact: 8, confidence: 7, ease: 6 })).toBe(336);
    expect(iceScore({ impact: 10, confidence: 10, ease: 10 })).toBe(1000);
  });
  it("is null unless all three are set", () => {
    expect(iceScore({ impact: 8, confidence: null, ease: 6 })).toBeNull();
    expect(iceScore({ impact: null, confidence: null, ease: null })).toBeNull();
  });
});

describe("compareIdeasForList", () => {
  const idea = (
    impact: number | null,
    confidence: number | null,
    ease: number | null,
    createdAtMs: number,
  ) => ({ impact, confidence, ease, createdAtMs });

  it("sorts highest ICE first", () => {
    const list = [idea(2, 2, 2, 1), idea(9, 9, 9, 2), idea(5, 5, 5, 3)];
    const sorted = [...list].sort(compareIdeasForList);
    expect(sorted.map((i) => iceScore(i))).toEqual([729, 125, 8]);
  });

  it("puts unscored ideas last", () => {
    const scored = idea(5, 5, 5, 1);
    const unscored = idea(null, null, null, 2);
    expect([unscored, scored].sort(compareIdeasForList)[0]).toBe(scored);
  });

  it("breaks ties (and unscored ties) by newest first", () => {
    const older = idea(null, null, null, 100);
    const newer = idea(null, null, null, 200);
    expect([older, newer].sort(compareIdeasForList)[0]).toBe(newer);
  });
});

describe("isOpenIdeaStatus", () => {
  it("is open for idea/under_review/approved, closed for promoted/parked", () => {
    expect(isOpenIdeaStatus("idea")).toBe(true);
    expect(isOpenIdeaStatus("approved")).toBe(true);
    expect(isOpenIdeaStatus("promoted")).toBe(false);
    expect(isOpenIdeaStatus("parked")).toBe(false);
  });
});
