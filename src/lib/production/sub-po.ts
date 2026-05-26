// Pure, DB-free helpers for multi-supplier POs: display numbering and planning
// which sub-POs to create from a stage→supplier assignment map. Kept
// side-effect-free for unit tests.

import type { ProductionStage } from "./stages";

/**
 * Display number for a PO:
 *  - standalone: "00100"
 *  - master (has sub-POs): "00100-Master"
 *  - sub-PO: "00100-A"
 */
export function formatPoNumber(
  shopifyPoNumber: string,
  opts?: { suffix?: string | null; isMaster?: boolean },
): string {
  if (opts?.suffix) return `${shopifyPoNumber}-${opts.suffix}`;
  if (opts?.isMaster) return `${shopifyPoNumber}-Master`;
  return shopifyPoNumber;
}

export interface SubPoPlan {
  supplierId: string;
  /** "A", "B", "C"… in stage-pipeline order. */
  suffix: string;
  /** The work stages this supplier owns. */
  stages: ProductionStage[];
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Plan the sub-POs for a multi-supplier PO. For each work stage (in pipeline
 * order) resolve its owner — the explicit assignment, else the primary supplier
 * — then group all of a supplier's stages into a single sub-PO. Suppliers are
 * ordered by where they first appear in the pipeline and lettered A, B, C…
 *
 * Returns one entry per distinct supplier. A result of length ≤ 1 means the PO
 * isn't actually split (everything routes to one supplier) — the caller should
 * treat that as a normal standalone PO.
 */
export function planSubPos(
  stages: ProductionStage[],
  assignments: { stage: ProductionStage; supplierId: string }[],
  primarySupplierId: string,
): SubPoPlan[] {
  const owner = new Map(
    assignments.filter((a) => a.supplierId).map((a) => [a.stage, a.supplierId]),
  );
  const order: string[] = [];
  const bySupplier = new Map<string, ProductionStage[]>();
  for (const stage of stages) {
    const sup = owner.get(stage) ?? primarySupplierId;
    if (!bySupplier.has(sup)) {
      bySupplier.set(sup, []);
      order.push(sup);
    }
    bySupplier.get(sup)!.push(stage);
  }
  return order.map((supplierId, i) => ({
    supplierId,
    suffix: LETTERS[i] ?? `${i + 1}`,
    stages: bySupplier.get(supplierId)!,
  }));
}

/** True when the assignments actually split the PO across >1 supplier. */
export function isMultiSupplier(plan: SubPoPlan[]): boolean {
  return plan.length > 1;
}
