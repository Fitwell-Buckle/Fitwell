import { describe, expect, it } from "vitest";
import { classifyRun } from "./run-summary";

describe("classifyRun", () => {
  it("OK: edition shipped, all sources fetched, hard news present", () => {
    const { status, reasons } = classifyRun({
      feedFailures: 0,
      hardNews: 4,
      produced: true,
    });
    expect(status).toBe("OK");
    expect(reasons).toEqual([]);
  });

  it("NO_BRIEF: nothing produced but every source fetched (quiet day, not a fault)", () => {
    expect(
      classifyRun({ feedFailures: 0, hardNews: 0, produced: false }).status,
    ).toBe("NO_BRIEF");
  });

  it("DEGRADED: edition shipped but with 0 hard-news (the 2026-06-14 case)", () => {
    const { status, reasons } = classifyRun({
      feedFailures: 3,
      hardNews: 0,
      produced: true,
    });
    expect(status).toBe("DEGRADED");
    expect(reasons).toContain("0 hard-news stories");
    expect(reasons).toContain("3 source failure(s)");
  });

  it("DEGRADED: a source failed even if the edition has hard news", () => {
    expect(
      classifyRun({ feedFailures: 1, hardNews: 5, produced: true }).status,
    ).toBe("DEGRADED");
  });

  it("DEGRADED: source failures on a no-brief day trump NO_BRIEF (failures may BE the cause)", () => {
    const { status, reasons } = classifyRun({
      feedFailures: 2,
      hardNews: 0,
      produced: false,
    });
    expect(status).toBe("DEGRADED");
    expect(reasons).toEqual(["2 source failure(s)"]);
  });

  it("does not flag 0 hard-news when nothing was produced (no false 0-hard-news reason)", () => {
    const { reasons } = classifyRun({
      feedFailures: 0,
      hardNews: 0,
      produced: false,
    });
    expect(reasons).not.toContain("0 hard-news stories");
  });
});
