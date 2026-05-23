import { describe, it, expect } from "vitest";
import {
  STAGES,
  nextStage,
  isComplete,
  derivePoStage,
  planAdvance,
  type ProductionStage,
} from "./stages";

describe("nextStage", () => {
  it("walks the fixed progression in order", () => {
    expect(nextStage("supplier_po")).toBe("stamping");
    expect(nextStage("packaging")).toBe("complete");
  });

  it("returns null at the terminal stage", () => {
    expect(nextStage("complete")).toBeNull();
  });

  it("covers every non-terminal stage", () => {
    for (let i = 0; i < STAGES.length - 1; i++) {
      expect(nextStage(STAGES[i])).toBe(STAGES[i + 1]);
    }
  });
});

describe("isComplete", () => {
  it("is true only for the terminal stage", () => {
    expect(isComplete("complete")).toBe(true);
    expect(isComplete("qc")).toBe(false);
  });
});

describe("derivePoStage", () => {
  it("returns null when there are no line items", () => {
    expect(derivePoStage([])).toBeNull();
  });

  it("returns the common stage when all items agree", () => {
    expect(derivePoStage(["polishing", "polishing"])).toBe("polishing");
  });

  it("returns 'mixed' when items diverge", () => {
    expect(derivePoStage(["polishing", "qc"])).toBe("mixed");
  });
});

describe("planAdvance — locked PO", () => {
  it("advances every non-complete line item one stage", () => {
    const plan = planAdvance({
      lockStagesTogether: true,
      lineItems: [
        { id: "a", currentStage: "stamping" },
        { id: "b", currentStage: "stamping" },
      ],
    });
    expect(plan).toEqual([
      { lineItemId: "a", from: "stamping", to: "edm" },
      { lineItemId: "b", from: "stamping", to: "edm" },
    ]);
  });

  it("skips line items already complete", () => {
    const plan = planAdvance({
      lockStagesTogether: true,
      lineItems: [
        { id: "a", currentStage: "complete" },
        { id: "b", currentStage: "packaging" },
      ],
    });
    expect(plan).toEqual([{ lineItemId: "b", from: "packaging", to: "complete" }]);
  });

  it("returns an empty plan when all items are complete", () => {
    const plan = planAdvance({
      lockStagesTogether: true,
      lineItems: [{ id: "a", currentStage: "complete" }],
    });
    expect(plan).toEqual([]);
  });
});

describe("planAdvance — broken PO", () => {
  const lineItems = [
    { id: "a", currentStage: "stamping" as ProductionStage },
    { id: "b", currentStage: "qc" as ProductionStage },
  ];

  it("advances only the targeted line item", () => {
    const plan = planAdvance({
      lockStagesTogether: false,
      lineItems,
      lineItemId: "b",
    });
    expect(plan).toEqual([{ lineItemId: "b", from: "qc", to: "packaging" }]);
  });

  it("throws when no target is provided", () => {
    expect(() =>
      planAdvance({ lockStagesTogether: false, lineItems }),
    ).toThrow(/lineItemId is required/);
  });

  it("throws when the target is not on the PO", () => {
    expect(() =>
      planAdvance({ lockStagesTogether: false, lineItems, lineItemId: "zzz" }),
    ).toThrow(/not found/);
  });

  it("returns an empty plan when the targeted item is already complete", () => {
    const plan = planAdvance({
      lockStagesTogether: false,
      lineItems: [{ id: "a", currentStage: "complete" }],
      lineItemId: "a",
    });
    expect(plan).toEqual([]);
  });
});
