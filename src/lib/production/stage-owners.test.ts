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

  it("routes the opening supplier_po state to the stamping owner (the kickoff)", () => {
    // supplier_po isn't real work — it belongs to whoever owns stamping.
    expect(supplierForStage(assignments, DEFAULT, "supplier_po")).toBe("sup-stamp");
    // …and falls back to the primary when stamping is unassigned.
    expect(supplierForStage([], DEFAULT, "supplier_po")).toBe(DEFAULT);
  });

  it("supplierOwnsStage reflects the resolution", () => {
    expect(supplierOwnsStage(assignments, DEFAULT, "sup-stamp", "stamping")).toBe(true);
    expect(supplierOwnsStage(assignments, DEFAULT, "sup-stamp", "edm")).toBe(false);
    expect(supplierOwnsStage(assignments, DEFAULT, "sup-main", "edm")).toBe(true);
  });

  it("the stamping supplier owns the kickoff (supplier_po) + stamping", () => {
    // supplier_po folds into the first work stage so the route stays contiguous.
    expect(stagesOwnedBySupplier(assignments, DEFAULT, "sup-stamp")).toEqual([
      "supplier_po",
      "stamping",
    ]);
  });

  it("the default supplier owns every later unassigned stage (in order)", () => {
    const owned = stagesOwnedBySupplier(assignments, DEFAULT, "sup-main");
    expect(owned).not.toContain("stamping");
    expect(owned).not.toContain("supplier_po"); // kickoff belongs to stamping owner
    expect(owned[0]).toBe("edm"); // pipeline order preserved
    expect(owned).toContain("packaging");
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
