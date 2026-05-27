import { describe, it, expect } from "vitest";
import {
  DEFAULT_STAGE_DAYS,
  MIN_SAMPLES,
  averageDays,
  resolveStageEstimate,
  buildStageEstimates,
  projectRemainingDays,
  projectEta,
  addDaysISO,
} from "@/lib/production/cycle-time";
import { STAGES } from "@/lib/production/stages";

const ORDER = [...STAGES];

describe("averageDays", () => {
  it("averages a list", () => {
    expect(averageDays([2, 4, 6])).toBe(4);
  });
  it("returns null for an empty list", () => {
    expect(averageDays([])).toBeNull();
  });
});

describe("resolveStageEstimate", () => {
  it("uses the default when there aren't enough samples", () => {
    expect(resolveStageEstimate("plating", [1, 1, 1])).toBe(
      DEFAULT_STAGE_DAYS.plating,
    );
  });

  it("uses the rolling average once there are >= MIN_SAMPLES samples", () => {
    const samples = Array(MIN_SAMPLES).fill(5);
    expect(resolveStageEstimate("plating", samples)).toBe(5);
  });

  it("rounds the rolling average to one decimal", () => {
    const samples = [...Array(9).fill(2), 3]; // 10 samples, mean 2.1
    expect(resolveStageEstimate("stamping", samples)).toBe(2.1);
  });

  it("falls back to FALLBACK_STAGE_DAYS for an unknown (newly added) stage", () => {
    expect(resolveStageEstimate("anodizing", [1, 1])).toBe(2);
  });
});

describe("buildStageEstimates", () => {
  it("mixes rolling averages and defaults per stage", () => {
    const est = buildStageEstimates(ORDER, {
      plating: Array(MIN_SAMPLES).fill(4), // enough → average 4
      qc: [1, 2], // too few → default
    });
    expect(est.plating).toBe(4);
    expect(est.qc).toBe(DEFAULT_STAGE_DAYS.qc);
    expect(est.supplier_po).toBe(DEFAULT_STAGE_DAYS.supplier_po);
    expect(est.complete).toBe(0);
  });
});

describe("projectRemainingDays", () => {
  it("sums the current stage and all later stages (excluding complete)", () => {
    // From qc: qc(1) + packaging(1) = 2 with defaults.
    expect(projectRemainingDays(ORDER, "qc", DEFAULT_STAGE_DAYS)).toBe(
      DEFAULT_STAGE_DAYS.qc + DEFAULT_STAGE_DAYS.packaging,
    );
  });

  it("is the full pipeline from the first stage", () => {
    const all =
      DEFAULT_STAGE_DAYS.supplier_po +
      DEFAULT_STAGE_DAYS.stamping +
      DEFAULT_STAGE_DAYS.edm +
      DEFAULT_STAGE_DAYS.polishing +
      DEFAULT_STAGE_DAYS.logo +
      DEFAULT_STAGE_DAYS.plating +
      DEFAULT_STAGE_DAYS.qc +
      DEFAULT_STAGE_DAYS.packaging;
    expect(projectRemainingDays(ORDER, "supplier_po", DEFAULT_STAGE_DAYS)).toBe(all);
  });

  it("is 0 once complete", () => {
    expect(projectRemainingDays(ORDER, "complete", DEFAULT_STAGE_DAYS)).toBe(0);
  });
});

describe("addDaysISO / projectEta", () => {
  it("adds days across a month boundary in UTC", () => {
    expect(addDaysISO("2026-05-30", 3)).toBe("2026-06-02");
  });

  it("projects an ETA from a date by remaining days", () => {
    // packaging(1) from 2026-05-24 → 2026-05-25
    expect(projectEta(ORDER, "packaging", "2026-05-24", DEFAULT_STAGE_DAYS)).toBe(
      "2026-05-25",
    );
  });

  it("returns the from-date when already complete", () => {
    expect(projectEta(ORDER, "complete", "2026-05-24", DEFAULT_STAGE_DAYS)).toBe(
      "2026-05-24",
    );
  });
});
