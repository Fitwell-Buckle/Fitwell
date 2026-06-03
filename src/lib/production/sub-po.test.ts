import { describe, it, expect } from "vitest";
import {
  formatPoNumber,
  planSubPos,
  isMultiSupplier,
  subPoStageState,
  subPoTransitions,
} from "./sub-po";
import { STAGES, type ProductionStage } from "./stages";

const ORDER = [...STAGES];

describe("formatPoNumber", () => {
  it("formats standalone, master, and sub-PO numbers", () => {
    expect(formatPoNumber("00100")).toBe("PO-00100");
    expect(formatPoNumber("00100", { isMaster: true })).toBe("PO-00100-Master");
    expect(formatPoNumber("00100", { suffix: "A" })).toBe("PO-00100-A");
    // suffix wins over isMaster if both are (wrongly) passed
    expect(formatPoNumber("00100", { suffix: "B", isMaster: true })).toBe("PO-00100-B");
  });
});

describe("planSubPos", () => {
  const stages: ProductionStage[] = [
    "stamping",
    "edm",
    "polishing",
    "logo",
    "plating",
    "qc",
    "packaging",
  ];

  it("groups a supplier's stages into one sub-PO, ordered by pipeline appearance", () => {
    const plan = planSubPos(
      ORDER,
      stages,
      [
        { stage: "stamping", supplierId: "sup-X" },
        { stage: "edm", supplierId: "sup-X" },
        { stage: "polishing", supplierId: "sup-Y" },
        { stage: "qc", supplierId: "sup-X" }, // X again, non-contiguous
      ],
      "sup-primary",
    );
    // X appears first (stamping) → A; Y next (polishing) → B; primary owns the
    // remaining unassigned stages (logo, plating, packaging) → C.
    expect(plan.map((p) => p.suffix)).toEqual(["A", "B", "C"]);
    expect(plan[0]).toMatchObject({ supplierId: "sup-X", suffix: "A" });
    expect(plan[0].stages).toEqual(["stamping", "edm", "qc"]);
    expect(plan[1]).toMatchObject({ supplierId: "sup-Y", suffix: "B", stages: ["polishing"] });
    expect(plan[2].supplierId).toBe("sup-primary");
    expect(plan[2].stages).toEqual(["logo", "plating", "packaging"]);
  });

  it("unassigned stages all fall to the primary supplier → a single sub-PO", () => {
    const plan = planSubPos(ORDER, stages, [], "sup-primary");
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ supplierId: "sup-primary", suffix: "A" });
    expect(isMultiSupplier(plan)).toBe(false);
  });

  it("flags a genuine multi-supplier split", () => {
    const plan = planSubPos(
      ORDER,
      stages,
      [{ stage: "polishing", supplierId: "sup-Y" }],
      "sup-primary",
    );
    // primary (A) owns everything except polishing; Y (B) owns polishing.
    expect(isMultiSupplier(plan)).toBe(true);
    expect(plan).toHaveLength(2);
  });
});

describe("subPoStageState", () => {
  // Supplier owns [stamping, edm]; line items flow through the shared pipeline.
  const owned: ProductionStage[] = ["stamping", "edm"];

  it("is 'waiting' while items are still upstream (e.g. supplier_po)", () => {
    const s = subPoStageState(ORDER, owned, ["supplier_po", "supplier_po"]);
    expect(s.status).toBe("waiting");
    expect(s.arrivedCount).toBe(0);
    expect(s.upstreamCount).toBe(2);
    expect(s.currentStage).toBeNull();
  });

  it("is 'advance' when an item can step forward within owned stages", () => {
    const s = subPoStageState(ORDER, owned, ["stamping", "stamping"]);
    expect(s.status).toBe("advance");
    expect(s.currentStage).toBe("stamping");
    expect(s.arrivedCount).toBe(2);
  });

  it("is 'complete' when every arrived item is parked at the last owned stage", () => {
    const s = subPoStageState(ORDER, owned, ["edm", "edm"]);
    expect(s.status).toBe("complete");
    expect(s.currentStage).toBe("edm");
  });

  it("stays 'waiting' if some items are at the last stage but others haven't arrived", () => {
    const s = subPoStageState(ORDER, owned, ["edm", "supplier_po"]);
    expect(s.status).toBe("waiting");
  });

  it("is 'advance' when items are mixed across owned stages", () => {
    const s = subPoStageState(ORDER, owned, ["stamping", "edm"]);
    expect(s.status).toBe("advance");
    expect(s.currentStage).toBe("stamping");
  });

  it("is 'done' once all items have moved past the owned stages", () => {
    const s = subPoStageState(ORDER, owned, ["polishing", "complete"]);
    expect(s.status).toBe("done");
    expect(s.doneCount).toBe(2);
  });

  it("treats a single-stage owner correctly (last == first)", () => {
    expect(subPoStageState(ORDER, ["polishing"], ["polishing"]).status).toBe("complete");
    expect(subPoStageState(ORDER, ["polishing"], ["stamping"]).status).toBe("waiting");
    expect(subPoStageState(ORDER, ["polishing"], ["qc"]).status).toBe("done");
  });
});

describe("subPoTransitions", () => {
  const owned: ProductionStage[] = ["stamping", "edm"];

  it("step: advances only within owned stages", () => {
    const t = subPoTransitions({
      order: ORDER,
      ownedStages: owned,
      lines: [
        { id: "a", currentStage: "stamping" },
        { id: "b", currentStage: "edm" }, // at last → no intra-step
        { id: "c", currentStage: "supplier_po" }, // upstream → untouched
      ],
      mode: "step",
    });
    expect(t).toEqual([{ lineItemId: "a", from: "stamping", to: "edm" }]);
  });

  it("complete: hands every owned-stage item off to the next supplier's stage", () => {
    const t = subPoTransitions({
      order: ORDER,
      ownedStages: owned,
      lines: [
        { id: "a", currentStage: "edm" },
        { id: "b", currentStage: "edm" },
      ],
      mode: "complete",
    });
    // edm's next stage is polishing — the handoff target.
    expect(t).toEqual([
      { lineItemId: "a", from: "edm", to: "polishing" },
      { lineItemId: "b", from: "edm", to: "polishing" },
    ]);
  });

  it("complete: the last supplier in the route hands off to 'complete'", () => {
    const t = subPoTransitions({
      order: ORDER,
      ownedStages: ["qc", "packaging"],
      lines: [{ id: "a", currentStage: "packaging" }],
      mode: "complete",
    });
    expect(t).toEqual([{ lineItemId: "a", from: "packaging", to: "complete" }]);
  });
});

describe("sub-PO with non-contiguous owned stages", () => {
  // Supplier owns stamping + polishing (EDM in between belongs to someone else).
  const owned: ProductionStage[] = ["stamping", "polishing"];

  it("hands off at each run boundary rather than jumping to the last stage", () => {
    // A line at stamping completes that run by handing off to EDM (not polishing).
    expect(
      subPoTransitions({ order: ORDER, ownedStages: owned, lines: [{ id: "a", currentStage: "stamping" }], mode: "complete" }),
    ).toEqual([{ lineItemId: "a", from: "stamping", to: "edm" }]);
    // A line back at polishing hands off to logo.
    expect(
      subPoTransitions({ order: ORDER, ownedStages: owned, lines: [{ id: "a", currentStage: "polishing" }], mode: "complete" }),
    ).toEqual([{ lineItemId: "a", from: "polishing", to: "logo" }]);
  });

  it("waits while the line sits in the gap stage (EDM) owned by another supplier", () => {
    expect(subPoStageState(ORDER, owned, ["edm"]).status).toBe("waiting");
    // ready to hand off the stamping run
    expect(subPoStageState(ORDER, owned, ["stamping"]).status).toBe("complete");
  });
});
