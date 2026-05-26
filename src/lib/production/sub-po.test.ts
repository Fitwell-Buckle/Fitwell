import { describe, it, expect } from "vitest";
import { formatPoNumber, planSubPos, isMultiSupplier } from "./sub-po";
import type { ProductionStage } from "./stages";

describe("formatPoNumber", () => {
  it("formats standalone, master, and sub-PO numbers", () => {
    expect(formatPoNumber("00100")).toBe("00100");
    expect(formatPoNumber("00100", { isMaster: true })).toBe("00100-Master");
    expect(formatPoNumber("00100", { suffix: "A" })).toBe("00100-A");
    // suffix wins over isMaster if both are (wrongly) passed
    expect(formatPoNumber("00100", { suffix: "B", isMaster: true })).toBe("00100-B");
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
    const plan = planSubPos(stages, [], "sup-primary");
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ supplierId: "sup-primary", suffix: "A" });
    expect(isMultiSupplier(plan)).toBe(false);
  });

  it("flags a genuine multi-supplier split", () => {
    const plan = planSubPos(
      stages,
      [{ stage: "polishing", supplierId: "sup-Y" }],
      "sup-primary",
    );
    // primary (A) owns everything except polishing; Y (B) owns polishing.
    expect(isMultiSupplier(plan)).toBe(true);
    expect(plan).toHaveLength(2);
  });
});
