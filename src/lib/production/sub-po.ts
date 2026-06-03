// Pure, DB-free helpers for multi-supplier POs: display numbering and planning
// which sub-POs to create from a stage→supplier assignment map. Kept
// side-effect-free for unit tests.

import { nextStage, type ProductionStage } from "./stages";
import { supplierForStage } from "./stage-owners";

/**
 * Display number for a PO — always prefixed "PO-" (like invoices' "INV-"):
 *  - standalone: "PO-00100"
 *  - master (has sub-POs): "PO-00100-Master"
 *  - sub-PO: "PO-00100-A"
 */
export function formatPoNumber(
  shopifyPoNumber: string,
  opts?: { suffix?: string | null; isMaster?: boolean },
): string {
  const base = `PO-${shopifyPoNumber}`;
  if (opts?.suffix) return `${base}-${opts.suffix}`;
  if (opts?.isMaster) return `${base}-Master`;
  return base;
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
  order: readonly string[],
  stages: ProductionStage[],
  assignments: { stage: ProductionStage; supplierId: string }[],
  primarySupplierId: string,
): SubPoPlan[] {
  const supplierOrder: string[] = [];
  const bySupplier = new Map<string, ProductionStage[]>();
  for (const stage of stages) {
    // supplierForStage folds the opening stage into the first-work owner, so the
    // first work supplier leads the route (and isn't held up).
    const sup = supplierForStage(order, assignments, primarySupplierId, stage) ?? primarySupplierId;
    if (!bySupplier.has(sup)) {
      bySupplier.set(sup, []);
      supplierOrder.push(sup);
    }
    bySupplier.get(sup)!.push(stage);
  }
  return supplierOrder.map((supplierId, i) => ({
    supplierId,
    suffix: LETTERS[i] ?? `${i + 1}`,
    stages: bySupplier.get(supplierId)!,
  }));
}

/** True when the assignments actually split the PO across >1 supplier. */
export function isMultiSupplier(plan: SubPoPlan[]): boolean {
  return plan.length > 1;
}

const indexer = (order: readonly string[]) => (s: ProductionStage): number =>
  order.indexOf(s);

/**
 * Where a sub-PO sits in its lifecycle. A sub-PO owns a contiguous slice of the
 * pipeline; the shared line items live on the master and flow through it.
 *
 *  - "waiting":  none of its line items have reached its stages yet (a previous
 *                supplier is still working), so there's nothing to do.
 *  - "advance":  at least one line item can move forward within the supplier's
 *                own stages (intermediate step, e.g. Stamping → EDM).
 *  - "complete": every line item the supplier is responsible for is parked at
 *                the LAST owned stage — ready to hand off to the next supplier.
 *  - "done":     all line items have moved past the supplier's stages.
 */
export type SubPoStageStatus = "waiting" | "advance" | "complete" | "done";

export interface SubPoStageState {
  ownedStages: ProductionStage[];
  currentStage: ProductionStage | null;
  arrivedCount: number;
  upstreamCount: number;
  doneCount: number;
  status: SubPoStageStatus;
}

export function subPoStageState(
  order: readonly string[],
  ownedStages: ProductionStage[],
  lineStages: ProductionStage[],
): SubPoStageState {
  const stageIndex = indexer(order);
  const owned = [...ownedStages].sort((a, b) => stageIndex(a) - stageIndex(b));
  const ownedSet = new Set(owned);
  if (owned.length === 0) {
    return {
      ownedStages: owned,
      currentStage: null,
      arrivedCount: 0,
      upstreamCount: 0,
      doneCount: lineStages.length,
      status: "done",
    };
  }
  // Compare against the LAST owned stage, not a contiguous [first..last] range:
  // a supplier may own a non-contiguous set (e.g. stamping + polishing). A line
  // is "upstream" if any owned stage still lies ahead of it; "done" once none do.
  const maxOwnedIdx = stageIndex(owned[owned.length - 1]);

  let arrivedCount = 0;
  let upstreamCount = 0;
  let doneCount = 0;
  const arrivedStages: ProductionStage[] = [];
  for (const s of lineStages) {
    if (ownedSet.has(s)) {
      arrivedCount++;
      arrivedStages.push(s);
    } else if (stageIndex(s) < maxOwnedIdx) {
      upstreamCount++;
    } else {
      doneCount++;
    }
  }

  const currentStage =
    arrivedStages.length > 0
      ? arrivedStages.reduce((a, b) => (stageIndex(a) <= stageIndex(b) ? a : b))
      : null;

  let status: SubPoStageStatus;
  if (arrivedCount === 0) {
    status = upstreamCount > 0 ? "waiting" : "done";
  } else {
    const canStep = arrivedStages.some((s) => {
      const n = nextStage(order, s);
      return n != null && ownedSet.has(n);
    });
    if (canStep) status = "advance";
    else status = upstreamCount > 0 ? "waiting" : "complete";
  }

  return {
    ownedStages: owned,
    currentStage,
    arrivedCount,
    upstreamCount,
    doneCount,
    status,
  };
}

export interface SubPoTransition {
  lineItemId: string;
  from: ProductionStage;
  to: ProductionStage;
}

/**
 * Plan the stage moves for a sub-PO action. Each move is decided per line
 * relative to its OWN next stage, so it's correct even for a supplier that owns
 * a non-contiguous set of stages.
 *  - "step":     advance each owned-stage line by one, but only when its next
 *                stage is also owned (an intermediate Stamping → EDM).
 *  - "complete": hand off each owned-stage line whose next stage is NOT owned —
 *                i.e. it's at a run boundary — to that next stage (the next
 *                supplier, or "complete" when this is the last stage).
 */
export function subPoTransitions(params: {
  order: readonly string[];
  ownedStages: ProductionStage[];
  lines: { id: string; currentStage: ProductionStage }[];
  mode: "step" | "complete";
}): SubPoTransition[] {
  const ownedSet = new Set(params.ownedStages);
  const out: SubPoTransition[] = [];
  for (const li of params.lines) {
    if (!ownedSet.has(li.currentStage)) continue;
    const to = nextStage(params.order, li.currentStage);
    if (to == null) continue;
    const nextOwned = ownedSet.has(to);
    if (params.mode === "step" ? nextOwned : !nextOwned) {
      out.push({ lineItemId: li.id, from: li.currentStage, to });
    }
  }
  return out;
}
