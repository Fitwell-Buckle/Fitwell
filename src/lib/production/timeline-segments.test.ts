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

  it("segments chain end-to-end with no gaps", () => {
    // Continuous-bar invariant: each segment's start equals the previous
    // segment's end. This is what makes the timeline render as one
    // uninterrupted strip with the today line as the only past/future cue.
    const segs = buildLineSegments(
      {
        currentStage: "polishing",
        stageEvents: [
          // Past stages with real history.
          {
            stage: "supplier_po",
            enteredAt: new Date(today - 6 * MS_PER_DAY),
            exitedAt: new Date(today - 4 * MS_PER_DAY),
          },
          {
            stage: "stamping",
            enteredAt: new Date(today - 4 * MS_PER_DAY),
            exitedAt: new Date(today - 2 * MS_PER_DAY),
          },
          {
            stage: "edm",
            enteredAt: new Date(today - 2 * MS_PER_DAY),
            exitedAt: new Date(today - 1 * MS_PER_DAY),
          },
          // Current stage — in progress.
          {
            stage: "polishing",
            enteredAt: new Date(today - 1 * MS_PER_DAY),
            exitedAt: null,
          },
        ],
      },
      today,
      "2026-06-09",
      ORDER,
      ESTIMATES,
    );
    // Walk through pairwise — every segment starts where the previous ended.
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].startMs).toBe(segs[i - 1].endMs);
    }
  });

  it("consolidates multiple events for the same stage (advance-then-move-back)", () => {
    // A line that was advanced from supplier_po → stamping and then moved
    // back to supplier_po should produce ONE supplier_po segment spanning
    // min(enteredAt) → still-here-now, not two separate bars with a gap.
    const segs = buildLineSegments(
      {
        currentStage: "supplier_po",
        stageEvents: [
          {
            stage: "supplier_po",
            enteredAt: new Date(today - 3 * MS_PER_DAY),
            exitedAt: new Date(today - 2 * MS_PER_DAY),
          },
          // Filtered out by supplier-portal scoping in practice; included
          // here just to confirm we don't get a stamping segment back.
          {
            stage: "supplier_po",
            enteredAt: new Date(today - 1 * MS_PER_DAY),
            exitedAt: null,
          },
        ],
      },
      today,
      "2026-06-09",
      ORDER,
      ESTIMATES,
    );
    const supplierPo = segs.filter((s) => s.stage === "supplier_po");
    expect(supplierPo).toHaveLength(1);
    // Earliest enteredAt as start; projected end (today + estimate).
    expect(supplierPo[0].startMs).toBe(today - 3 * MS_PER_DAY);
    expect(supplierPo[0].projected).toBe(true); // current = projected
  });

  it("past stages without events cursor-walk forward (no broken chain)", () => {
    // No stage_events at all — every stage is "past or current" cursor-walked
    // from today. Still emits a continuous chain.
    const segs = buildLineSegments(
      {
        currentStage: "supplier_po",
        stageEvents: [],
      },
      today,
      "2026-06-09",
      ORDER,
      ESTIMATES,
    );
    // 8 stages (everything except terminal `complete`).
    expect(segs).toHaveLength(8);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].startMs).toBe(segs[i - 1].endMs);
    }
  });

  it("makes an explicit Final ETA authoritative — compresses the chain to land on it", () => {
    const SPRING = ["supplier_po", "stamping", "packaging", "complete"];
    // Natural estimate projection (2d each) would end at today+6. The ETA on
    // the last projected stage (packaging) is today+3 — earlier than the
    // projection.
    const eta = today + 3 * MS_PER_DAY;
    const segs = buildLineSegments(
      {
        currentStage: "supplier_po",
        stages: SPRING,
        stageEvents: [
          { stage: "supplier_po", enteredAt: new Date(today), exitedAt: null },
        ],
      },
      today,
      "2026-06-09",
      ORDER,
      ESTIMATES,
      new Map<ProductionStage, number>([["packaging", eta]]),
    );
    const projected = segs.filter((s) => s.projected);
    // Bar ends exactly on the ETA, not the (later) estimate projection.
    expect(projected[projected.length - 1].endMs).toBe(eta);
    // Proportionally compressed (scale 0.5): supplier_po, stamping each 1d.
    expect(projected.map((s) => s.endMs)).toEqual([
      today + 1 * MS_PER_DAY,
      today + 2 * MS_PER_DAY,
      eta,
    ]);
    // Chain stays unbroken.
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].startMs).toBe(segs[i - 1].endMs);
    }
  });

  it("stretches the chain to a later Final ETA too", () => {
    const SPRING = ["supplier_po", "stamping", "packaging", "complete"];
    const eta = today + 12 * MS_PER_DAY; // later than the today+6 estimate
    const segs = buildLineSegments(
      {
        currentStage: "supplier_po",
        stages: SPRING,
        stageEvents: [
          { stage: "supplier_po", enteredAt: new Date(today), exitedAt: null },
        ],
      },
      today,
      "2026-06-09",
      ORDER,
      ESTIMATES,
      new Map<ProductionStage, number>([["packaging", eta]]),
    );
    const projected = segs.filter((s) => s.projected);
    expect(projected[projected.length - 1].endMs).toBe(eta);
  });

  it("leaves the estimate projection alone when there's no Final ETA", () => {
    const SPRING = ["supplier_po", "stamping", "packaging", "complete"];
    const segs = buildLineSegments(
      {
        currentStage: "supplier_po",
        stages: SPRING,
        stageEvents: [
          { stage: "supplier_po", enteredAt: new Date(today), exitedAt: null },
        ],
      },
      today,
      "2026-06-09",
      ORDER,
      ESTIMATES,
    );
    const projected = segs.filter((s) => s.projected);
    // Unchanged: 3 stages × 2d estimate = ends at today+6.
    expect(projected[projected.length - 1].endMs).toBe(today + 6 * MS_PER_DAY);
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
