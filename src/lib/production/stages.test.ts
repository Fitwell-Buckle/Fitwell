import { describe, it, expect } from "vitest";
import {
  STAGES,
  nextStage,
  prevStage,
  isTerminal,
  firstStage,
  terminalStage,
  derivePoStage,
  planAdvance,
  planSetStage,
  type ProductionStage,
} from "./stages";

const ORDER = [...STAGES];

describe("nextStage", () => {
  it("walks the progression in order", () => {
    expect(nextStage(ORDER, "supplier_po")).toBe("stamping");
    expect(nextStage(ORDER, "packaging")).toBe("complete");
  });

  it("returns null at the terminal stage", () => {
    expect(nextStage(ORDER, "complete")).toBeNull();
  });

  it("covers every non-terminal stage", () => {
    for (let i = 0; i < ORDER.length - 1; i++) {
      expect(nextStage(ORDER, ORDER[i])).toBe(ORDER[i + 1]);
    }
  });
});

describe("prevStage", () => {
  it("walks backward and stops at the first stage", () => {
    expect(prevStage(ORDER, "stamping")).toBe("supplier_po");
    expect(prevStage(ORDER, "supplier_po")).toBeNull();
  });
});

describe("first / terminal helpers", () => {
  it("identifies the bookend stages by position", () => {
    expect(firstStage(ORDER)).toBe("supplier_po");
    expect(terminalStage(ORDER)).toBe("complete");
    expect(isTerminal(ORDER, "complete")).toBe(true);
    expect(isTerminal(ORDER, "qc")).toBe(false);
  });

  it("respects a custom order (renamed/reordered stages)", () => {
    const custom = ["intake", "cut", "ship"];
    expect(firstStage(custom)).toBe("intake");
    expect(terminalStage(custom)).toBe("ship");
    expect(nextStage(custom, "cut")).toBe("ship");
    expect(isTerminal(custom, "ship")).toBe(true);
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
      order: ORDER,
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
      order: ORDER,
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
      order: ORDER,
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
      order: ORDER,
      lockStagesTogether: false,
      lineItems,
      lineItemId: "b",
    });
    expect(plan).toEqual([{ lineItemId: "b", from: "qc", to: "packaging" }]);
  });

  it("throws when no target is provided", () => {
    expect(() =>
      planAdvance({ order: ORDER, lockStagesTogether: false, lineItems }),
    ).toThrow(/lineItemId is required/);
  });

  it("throws when the target is not on the PO", () => {
    expect(() =>
      planAdvance({ order: ORDER, lockStagesTogether: false, lineItems, lineItemId: "zzz" }),
    ).toThrow(/not found/);
  });

  it("returns an empty plan when the targeted item is already complete", () => {
    const plan = planAdvance({
      order: ORDER,
      lockStagesTogether: false,
      lineItems: [{ id: "a", currentStage: "complete" }],
      lineItemId: "a",
    });
    expect(plan).toEqual([]);
  });
});

describe("planSetStage", () => {
  const lineItems = [
    { id: "a", currentStage: "stamping" as ProductionStage },
    { id: "b", currentStage: "edm" as ProductionStage },
  ];

  it("locked: moves every item to the target stage", () => {
    const plan = planSetStage({
      lockStagesTogether: true,
      lineItems,
      lineItemId: "a",
      toStage: "qc",
    });
    expect(plan).toEqual([
      { lineItemId: "a", from: "stamping", to: "qc" },
      { lineItemId: "b", from: "edm", to: "qc" },
    ]);
  });

  it("broken: moves only the dragged item", () => {
    const plan = planSetStage({
      lockStagesTogether: false,
      lineItems,
      lineItemId: "b",
      toStage: "polishing",
    });
    expect(plan).toEqual([{ lineItemId: "b", from: "edm", to: "polishing" }]);
  });

  it("allows moving backward", () => {
    const plan = planSetStage({
      lockStagesTogether: false,
      lineItems: [{ id: "a", currentStage: "qc" }],
      lineItemId: "a",
      toStage: "stamping",
    });
    expect(plan).toEqual([{ lineItemId: "a", from: "qc", to: "stamping" }]);
  });

  it("skips items already at the target stage", () => {
    const plan = planSetStage({
      lockStagesTogether: true,
      lineItems: [
        { id: "a", currentStage: "qc" },
        { id: "b", currentStage: "edm" },
      ],
      lineItemId: "b",
      toStage: "qc",
    });
    expect(plan).toEqual([{ lineItemId: "b", from: "edm", to: "qc" }]);
  });

  it("throws when the dragged item is not on the PO", () => {
    expect(() =>
      planSetStage({
        lockStagesTogether: false,
        lineItems,
        lineItemId: "zzz",
        toStage: "qc",
      }),
    ).toThrow(/not found/);
  });
});
