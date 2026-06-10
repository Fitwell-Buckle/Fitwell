import { describe, it, expect } from "vitest";
import {
  computeStageTargets,
  isStageOn,
  toggleStageChip,
  type SeederLine,
} from "@/lib/production/stage-eta-seeder";
import {
  emptyCycleTimeSamples,
  pushCycleTimeSample,
  MIN_SAMPLES,
} from "@/lib/production/cycle-time";
import { STAGES } from "@/lib/production/stages";

const ORDER = [...STAGES];

// 2-week PO: issued → 14 days → ETA. Even-split across 8 work stages
// (everything except complete) = 14/8 = 1.75 days/stage on the Tier 4 path.
const ISSUED = "2026-06-01";
const ETA = "2026-06-15";

describe("computeStageTargets — Tier 4 (po_split) walk", () => {
  it("walks one full-pipeline line and emits a target per work stage", () => {
    // Per-line ETA drives Tier 4 (sub-PO ETA is no longer a fallback).
    const lines: SeederLine[] = [
      {
        sku: "FB-16",
        productId: "PROD-A",
        quantity: 50,
        stages: null,
        expectedCompletionDate: ETA,
      },
    ];
    const out = computeStageTargets({
      order: ORDER,
      issuedDate: ISSUED,
      subPoEta: ETA,
      lines,
      samples: emptyCycleTimeSamples(),
    });
    // 8 work stages, no entry for the terminal `complete`.
    expect(out.map((s) => s.stage)).toEqual(ORDER.slice(0, -1));
    // First stage end = ISSUED + 1.75 days, rounded to whole days (addDaysISO
    // rounds via Math.round → 2 days). 2026-06-03.
    expect(out[0].targetEndDate).toBe("2026-06-03");
  });

  it("walks a per-line subset and only writes targets for visited stages", () => {
    const lines: SeederLine[] = [
      {
        sku: "SPRING",
        productId: "PROD-B",
        quantity: 100,
        stages: ["supplier_po", "stamping", "packaging", "complete"],
        expectedCompletionDate: ETA,
      },
    ];
    const out = computeStageTargets({
      order: ORDER,
      issuedDate: ISSUED,
      subPoEta: ETA,
      lines,
      samples: emptyCycleTimeSamples(),
    });
    // Only supplier_po, stamping, packaging — no edm/polishing/logo/plating/qc.
    expect(out.map((s) => s.stage)).toEqual([
      "supplier_po",
      "stamping",
      "packaging",
    ]);
  });

  it("aggregates across lines using MAX per stage", () => {
    // Two lines with very different qty under Tier-3 (global) samples → the
    // bigger line's end dates dominate every shared stage.
    const samples = emptyCycleTimeSamples();
    for (let i = 0; i < MIN_SAMPLES; i++) {
      pushCycleTimeSample(samples, {
        sku: "X",
        productId: null,
        stage: "stamping",
        durationDays: 0.1, // per-unit days
        quantity: 1,
      });
    }
    // Both lines need per-line ETA so Tier 4 powers the supplier_po fallback.
    const lines: SeederLine[] = [
      {
        sku: "SMALL",
        productId: null,
        quantity: 10,
        stages: null,
        expectedCompletionDate: ETA,
      },
      {
        sku: "BIG",
        productId: null,
        quantity: 100,
        stages: null,
        expectedCompletionDate: ETA,
      },
    ];
    const out = computeStageTargets({
      order: ORDER,
      issuedDate: ISSUED,
      subPoEta: ETA,
      lines,
      samples,
    });
    const stamping = out.find((s) => s.stage === "stamping")!;
    // supplier_po for both lines = 2026-06-03 (1.75 → 2 days). BIG's stamping
    // end is 2026-06-13 (+10), SMALL's is 2026-06-04 (+1). Expect MAX.
    expect(stamping.targetEndDate).toBe("2026-06-13");
  });

  it("returns [] for no lines", () => {
    expect(
      computeStageTargets({
        order: ORDER,
        issuedDate: ISSUED,
        subPoEta: ETA,
        lines: [],
        samples: emptyCycleTimeSamples(),
      }),
    ).toEqual([]);
  });

  it("works with no per-line ETA (Tier 4 disabled → falls to defaults)", () => {
    const out = computeStageTargets({
      order: ORDER,
      issuedDate: ISSUED,
      subPoEta: null,
      lines: [{ sku: "X", productId: null, quantity: 1, stages: null }],
      samples: emptyCycleTimeSamples(),
    });
    expect(out.length).toBe(ORDER.length - 1);
    // First stage = supplier_po default (3 days from ISSUED → 2026-06-04).
    expect(out[0].stage).toBe("supplier_po");
    expect(out[0].targetEndDate).toBe("2026-06-04");
  });

  it("clamps target dates non-decreasing along the pipeline", () => {
    // Mixed-line case that would otherwise produce inversions: a
    // spring-bar line (4 stages) gets 21/4 ≈ 5 days/stage, dragging
    // `stamping` to ~+10 days from ISSUED; a buckle line (8 stages) gets
    // 21/8 ≈ 3 days/stage, so without the clamp `edm` (only the buckle
    // visits) would land BEFORE `stamping`. The clamp lifts it to ≥ stamping.
    const lines: SeederLine[] = [
      {
        sku: "BUCKLE",
        productId: null,
        quantity: 50,
        stages: null,
      },
      {
        sku: "SPRING",
        productId: null,
        quantity: 100,
        stages: ["supplier_po", "stamping", "packaging", "complete"],
      },
    ];
    const out = computeStageTargets({
      order: ORDER,
      issuedDate: ISSUED,
      subPoEta: ETA,
      lines,
      samples: emptyCycleTimeSamples(),
    });
    // Walk pairwise: each stage's targetEndDate must be ≥ the previous.
    for (let i = 1; i < out.length; i++) {
      expect(out[i].targetEndDate >= out[i - 1].targetEndDate).toBe(true);
    }
  });

  it("supplier anchor: pins the last owned stage to the line's own ETA", () => {
    // Supplier owns [supplier_po, stamping]. Line carries its own ETA.
    const out = computeStageTargets({
      order: ORDER,
      issuedDate: ISSUED,
      subPoEta: null, // sub-PO ETA no longer participates
      lines: [
        {
          sku: "X",
          productId: null,
          quantity: 1,
          stages: null,
          expectedCompletionDate: ETA,
        },
      ],
      samples: emptyCycleTimeSamples(),
      ownedStages: ["supplier_po", "stamping"],
    });
    const stamping = out.find((s) => s.stage === "stamping")!;
    expect(stamping.targetEndDate).toBe(ETA);
    // supplier_po cursor-walks; doesn't get pinned.
    const supplierPo = out.find((s) => s.stage === "supplier_po")!;
    expect(supplierPo.targetEndDate).not.toBe(ETA);
  });

  it("supplier anchor: doesn't override when cursor-walked end already exceeds the line ETA", () => {
    // Massive line that would naturally overrun the promise — the anchor
    // should NOT pull stamping back; the overrun is a real signal.
    const SHORT_ETA = "2026-06-03"; // 2 days from ISSUED
    const out = computeStageTargets({
      order: ORDER,
      issuedDate: ISSUED,
      subPoEta: null,
      lines: [
        {
          sku: "X",
          productId: null,
          quantity: 1,
          stages: null,
          expectedCompletionDate: SHORT_ETA,
        },
      ],
      samples: emptyCycleTimeSamples(),
      ownedStages: ["supplier_po", "stamping"],
    });
    const stamping = out.find((s) => s.stage === "stamping")!;
    // 2 / 9 stages = ~0.2 day → supplier_po ends ~06/01, stamping ~06/01.
    // SHORT_ETA = 06/03 is LATER, so the anchor lifts stamping to 06/03.
    expect(stamping.targetEndDate).toBe(SHORT_ETA);
  });

  it("ignores legacy subPoEta when the line has no ETA of its own", () => {
    // Even if subPoEta is provided (legacy callers), no anchor + no Tier 4.
    // The bar falls back to cycle-time defaults — the user-visible per-line
    // ETA is the only thing that can move the right edge.
    const out = computeStageTargets({
      order: ORDER,
      issuedDate: ISSUED,
      subPoEta: ETA,
      lines: [{ sku: "X", productId: null, quantity: 1, stages: null }],
      samples: emptyCycleTimeSamples(),
      ownedStages: ["supplier_po", "stamping"],
    });
    const stamping = out.find((s) => s.stage === "stamping")!;
    expect(stamping.targetEndDate).not.toBe(ETA);
  });

  it("supplier anchor: no-op when ownedStages is absent", () => {
    const noAnchor = computeStageTargets({
      order: ORDER,
      issuedDate: ISSUED,
      subPoEta: null,
      lines: [
        {
          sku: "X",
          productId: null,
          quantity: 1,
          stages: null,
          expectedCompletionDate: ETA,
        },
      ],
      samples: emptyCycleTimeSamples(),
    });
    const stamping = noAnchor.find((s) => s.stage === "stamping")!;
    expect(stamping.targetEndDate).not.toBe(ETA);
  });

  it("excludes the terminal stage from output", () => {
    const out = computeStageTargets({
      order: ORDER,
      issuedDate: ISSUED,
      subPoEta: ETA,
      lines: [{ sku: "X", productId: null, quantity: 1, stages: null }],
      samples: emptyCycleTimeSamples(),
    });
    expect(out.find((s) => s.stage === "complete")).toBeUndefined();
  });
});

// Chip toggle helper backing the new-PO form's per-line stage picker.
describe("isStageOn / toggleStageChip", () => {
  it("inherit (null) treats every stage as on", () => {
    for (const s of ORDER) {
      expect(isStageOn(s, null)).toBe(true);
    }
  });

  it("explicit subset: only listed stages are on", () => {
    const v = ["supplier_po", "stamping", "packaging", "complete"];
    expect(isStageOn("stamping", v)).toBe(true);
    expect(isStageOn("edm", v)).toBe(false);
  });

  it("toggling one stage off opts into the subset (with bookends)", () => {
    const out = toggleStageChip("edm", ORDER, null);
    // 7 work stages (stamping..packaging) − edm = 6 + bookends = 8 entries.
    expect(out).toEqual([
      "supplier_po",
      "stamping",
      "polishing",
      "logo",
      "plating",
      "qc",
      "packaging",
      "complete",
    ]);
  });

  it("toggling the only-off stage back on collapses to null (inherit)", () => {
    const subset = toggleStageChip("edm", ORDER, null)!;
    expect(toggleStageChip("edm", ORDER, subset)).toBeNull();
  });

  it("toggling a second stage off shrinks the subset further", () => {
    const a = toggleStageChip("edm", ORDER, null)!;
    const b = toggleStageChip("polishing", ORDER, a)!;
    expect(b).toEqual([
      "supplier_po",
      "stamping",
      "logo",
      "plating",
      "qc",
      "packaging",
      "complete",
    ]);
  });

  it("subset preserves the global pipeline's order, not toggle order", () => {
    // Turn off polishing FIRST, then logo. Final list must still go
    // stamping → plating in canonical order.
    const a = toggleStageChip("polishing", ORDER, null)!;
    const b = toggleStageChip("logo", ORDER, a)!;
    expect(b.indexOf("stamping")).toBeLessThan(b.indexOf("plating"));
    expect(b.includes("polishing")).toBe(false);
    expect(b.includes("logo")).toBe(false);
  });

  it("no-op when order has no work stages (only bookends)", () => {
    expect(toggleStageChip("anything", ["a", "b"], null)).toBeNull();
  });
});
