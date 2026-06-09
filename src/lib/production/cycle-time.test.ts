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
  emptyCycleTimeSamples,
  pushCycleTimeSample,
  estimateLineStageDays,
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

// ── Tiered estimator (sku → product → global → po_split → default) ──────
describe("estimateLineStageDays", () => {
  // Fill a sample bucket with N entries averaging `perUnit` days/unit.
  const fillSamples = (
    label: "sku" | "product" | "global",
    stage: string,
    perUnit: number,
    count: number,
    id = "x",
  ) => {
    const s = emptyCycleTimeSamples();
    for (let i = 0; i < count; i++) {
      pushCycleTimeSample(s, {
        sku: label === "sku" ? id : "OTHER",
        productId: label === "product" ? id : null,
        stage,
        durationDays: perUnit,
        quantity: 1, // per-unit shortcut: 1 unit, so duration == perUnit
      });
    }
    return s;
  };

  it("Tier 1 (sku+stage): qty-multiplies the per-unit rolling avg", () => {
    // 10 samples of 0.1 days/unit on (FB-16, polishing). 100 units → 10 days.
    const samples = fillSamples("sku", "polishing", 0.1, MIN_SAMPLES, "FB-16");
    const est = estimateLineStageDays({
      stage: "polishing",
      sku: "FB-16",
      productId: "PROD-A",
      lineQty: 100,
      lineStageCount: 7,
      poTotalDays: 30,
      samples,
    });
    expect(est).toEqual({ days: 10, source: "sku" });
  });

  it("Tier 2 (product+stage): used when SKU samples are too few", () => {
    // 10 product samples on PROD-A averaging 0.05 days/unit. SKU FB-22 has
    // no samples of its own — should fall to product tier and multiply by qty.
    const samples = fillSamples("product", "stamping", 0.05, MIN_SAMPLES, "PROD-A");
    const est = estimateLineStageDays({
      stage: "stamping",
      sku: "FB-22",
      productId: "PROD-A",
      lineQty: 200,
      lineStageCount: 7,
      poTotalDays: 30,
      samples,
    });
    expect(est).toEqual({ days: 10, source: "product" }); // 0.05 × 200
  });

  it("Tier 3 (global): used when neither SKU nor product has enough", () => {
    const samples = fillSamples("global", "qc", 0.02, MIN_SAMPLES);
    const est = estimateLineStageDays({
      stage: "qc",
      sku: "NEW-SKU",
      productId: "NEW-PROD",
      lineQty: 50,
      lineStageCount: 7,
      poTotalDays: 30,
      samples,
    });
    expect(est).toEqual({ days: 1, source: "global" }); // 0.02 × 50 = 1
  });

  it("Tier 4 (po_split): no samples → poTotalDays / lineStageCount", () => {
    const samples = emptyCycleTimeSamples();
    const est = estimateLineStageDays({
      stage: "plating",
      sku: "NEW-SKU",
      productId: null,
      lineQty: 100,
      lineStageCount: 4, // e.g. spring bar with 4 stages
      poTotalDays: 20,
      samples,
    });
    expect(est).toEqual({ days: 5, source: "po_split" }); // 20 / 4 = 5
  });

  it("Tier 5 (default): no samples + no PO context → hardcoded defaults", () => {
    const est = estimateLineStageDays({
      stage: "plating",
      sku: "NEW",
      productId: null,
      lineQty: 1,
      lineStageCount: 7,
      poTotalDays: null,
      samples: emptyCycleTimeSamples(),
    });
    expect(est).toEqual({ days: DEFAULT_STAGE_DAYS.plating, source: "default" });
  });

  it("clamps negative results to 0 (a malformed sample shouldn't go negative)", () => {
    // Construct a sample bucket directly with a negative per-unit value (the
    // pushCycleTimeSample helper rejects negative durationDays at input, so
    // we bypass it to test the clamp inside estimateLineStageDays).
    const samples = emptyCycleTimeSamples();
    samples.byStage.set(
      "polishing",
      Array(MIN_SAMPLES).fill(-0.5),
    );
    const est = estimateLineStageDays({
      stage: "polishing",
      sku: "X",
      productId: null,
      lineQty: 10,
      lineStageCount: 7,
      poTotalDays: null,
      samples,
    });
    expect(est.days).toBe(0);
    expect(est.source).toBe("global");
  });

  it("ignores invalid samples at push time (qty ≤ 0 or negative duration)", () => {
    const samples = emptyCycleTimeSamples();
    pushCycleTimeSample(samples, {
      sku: "X",
      productId: null,
      stage: "polishing",
      durationDays: -1,
      quantity: 5,
    });
    pushCycleTimeSample(samples, {
      sku: "X",
      productId: null,
      stage: "polishing",
      durationDays: 1,
      quantity: 0,
    });
    expect(samples.byStage.size).toBe(0);
  });
});
