import { describe, it, expect } from "vitest";
import {
  supplierForStage,
  supplierOwnsStage,
  stagesOwnedBySupplier,
  supplierHasAnyStage,
  isHandoff,
  type StageAssignment,
} from "@/lib/production/stage-owners";

const DEFAULT = "sup-main";
// Stamping is split off to another supplier; everything else defaults to main.
const assignments: StageAssignment[] = [{ stage: "stamping", supplierId: "sup-stamp" }];

describe("stage-owners", () => {
  it("resolves an assigned stage to its supplier", () => {
    expect(supplierForStage(assignments, DEFAULT, "stamping")).toBe("sup-stamp");
  });

  it("falls back to the PO's primary supplier for unassigned stages", () => {
    expect(supplierForStage(assignments, DEFAULT, "edm")).toBe(DEFAULT);
    expect(supplierForStage(assignments, DEFAULT, "packaging")).toBe(DEFAULT);
  });

  it("supplierOwnsStage reflects the resolution", () => {
    expect(supplierOwnsStage(assignments, DEFAULT, "sup-stamp", "stamping")).toBe(true);
    expect(supplierOwnsStage(assignments, DEFAULT, "sup-stamp", "edm")).toBe(false);
    expect(supplierOwnsStage(assignments, DEFAULT, "sup-main", "edm")).toBe(true);
  });

  it("the stamping supplier owns only stamping", () => {
    expect(stagesOwnedBySupplier(assignments, DEFAULT, "sup-stamp")).toEqual(["stamping"]);
  });

  it("the default supplier owns every unassigned stage (in order)", () => {
    const owned = stagesOwnedBySupplier(assignments, DEFAULT, "sup-main");
    expect(owned).not.toContain("stamping");
    expect(owned).toContain("edm");
    expect(owned[0]).toBe("supplier_po"); // pipeline order preserved
  });

  it("supplierHasAnyStage gates portal access", () => {
    expect(supplierHasAnyStage(assignments, DEFAULT, "sup-stamp")).toBe(true);
    expect(supplierHasAnyStage(assignments, DEFAULT, "sup-other")).toBe(false);
    expect(supplierHasAnyStage(assignments, DEFAULT, null)).toBe(false);
  });

  it("detects a handoff when the line leaves the supplier's stages", () => {
    // stamping → edm: sup-stamp owns stamping, not edm → handoff
    expect(isHandoff(assignments, DEFAULT, "sup-stamp", "stamping", "edm")).toBe(true);
    // edm → polishing for the default owner: still theirs → not a handoff
    expect(isHandoff(assignments, DEFAULT, "sup-main", "edm", "polishing")).toBe(false);
    // a supplier who never owned the from-stage isn't handing anything off
    expect(isHandoff(assignments, DEFAULT, "sup-stamp", "edm", "polishing")).toBe(false);
  });
});
