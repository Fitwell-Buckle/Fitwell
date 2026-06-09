import { describe, it, expect } from "vitest";
import { buildLineSegments, MS_PER_DAY, utcMidnight } from "./timeline-segments";
import { STAGES, type ProductionStage } from "./stages";

const ORDER = [...STAGES];

// Default stage estimates — keep simple round numbers so projection arithmetic
// is obvious in expectations.
const ESTIMATES: Record<ProductionStage, number> = Object.fromEntries(
  ORDER.map((s) => [s, 2]),
) as Record<ProductionStage, number>;

const today = utcMidnight("2026-06-09");

describe("buildLineSegments — per-line stages", () => {
  it("walks the global pipeline when stages is undefined", () => {
    // Buckle at stamping: projected segments for stamping, edm, polishing,
    // logo, plating, qc, packaging (7 stages before terminal `complete`).
    const segs = buildLineSegments(
      {
        currentStage: "stamping",
        stageEvents: [
          {
            stage: "stamping",
            enteredAt: new Date(today),
            exitedAt: null,
          },
        ],
      },
      today,
      "2026-06-09",
      ORDER,
      ESTIMATES,
    );
    const projected = segs.filter((s) => s.projected);
    expect(projected.map((s) => s.stage)).toEqual([
      "stamping",
      "edm",
      "polishing",
      "logo",
      "plating",
      "qc",
      "packaging",
    ]);
  });

  it("walks the per-line subset and skips stages not in the list", () => {
    // Spring bar at stamping → goes straight to packaging next, skipping
    // edm/polishing/logo/plating/qc entirely.
    const SPRING = ["supplier_po", "stamping", "packaging", "complete"];
    const segs = buildLineSegments(
      {
        currentStage: "stamping",
        stages: SPRING,
        stageEvents: [
          {
            stage: "stamping",
            enteredAt: new Date(today),
            exitedAt: null,
          },
        ],
      },
      today,
      "2026-06-09",
      ORDER,
      ESTIMATES,
    );
    const projected = segs.filter((s) => s.projected);
    expect(projected.map((s) => s.stage)).toEqual(["stamping", "packaging"]);
    // Confirm there are no phantom edm/polishing/logo/plating/qc segments.
    expect(projected.find((s) => s.stage === "edm")).toBeUndefined();
  });

  it("treats the line's last-listed-before-complete stage as terminal", () => {
    // Spring bar already at packaging → its terminal-for-this-line is
    // `complete`, so no further projected segments.
    const SPRING = ["supplier_po", "stamping", "packaging", "complete"];
    const segs = buildLineSegments(
      {
        currentStage: "complete",
        stages: SPRING,
        stageEvents: [
          {
            stage: "packaging",
            enteredAt: new Date(today - MS_PER_DAY),
            exitedAt: new Date(today),
          },
        ],
      },
      today,
      "2026-06-09",
      ORDER,
      ESTIMATES,
    );
    expect(segs.filter((s) => s.projected)).toEqual([]);
  });

  it("empty stages array falls back to the global pipeline", () => {
    const segs = buildLineSegments(
      {
        currentStage: "stamping",
        stages: [],
        stageEvents: [
          {
            stage: "stamping",
            enteredAt: new Date(today),
            exitedAt: null,
          },
        ],
      },
      today,
      "2026-06-09",
      ORDER,
      ESTIMATES,
    );
    const projected = segs.filter((s) => s.projected);
    expect(projected.map((s) => s.stage)).toEqual([
      "stamping",
      "edm",
      "polishing",
      "logo",
      "plating",
      "qc",
      "packaging",
    ]);
  });
});
