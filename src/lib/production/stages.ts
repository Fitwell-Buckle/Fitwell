// Pure, DB-free stage logic for the production module. Stages are now dynamic
// (added / renamed / deleted / reordered at runtime, stored in
// production_stage_def). The arrays below are the DEFAULT seed + fallback; the
// live order/labels come from getStages()/getStageOrder() (server) or
// useStages() (client). Functions that depend on pipeline order take the
// ordered key list explicitly so they stay pure + unit-testable.

export const STAGES = [
  "supplier_po",
  "stamping",
  "edm",
  "polishing",
  "logo",
  "plating",
  "qc",
  "packaging",
  "complete",
] as const;

// A stage key is now an arbitrary string (user-defined), not a fixed union.
export type ProductionStage = string;

/** Default seed labels — overridden per-key by production_stage_def.label. */
export const STAGE_LABELS: Record<string, string> = {
  supplier_po: "Supplier PO",
  stamping: "Raw Material Stamping",
  edm: "EDM",
  polishing: "Polishing",
  logo: "Logo",
  plating: "Plating",
  qc: "QC",
  packaging: "Packaging",
  complete: "Complete",
};

/** The opening stage = first in pipeline order (where POs open + routing kicks off). */
export function firstStage(order: readonly string[]): ProductionStage {
  return order[0];
}

/** The terminal stage = last in pipeline order (reaching it triggers receive). */
export function terminalStage(order: readonly string[]): ProductionStage {
  return order[order.length - 1];
}

/** Whether `stage` is the terminal (last) stage in this order. */
export function isTerminal(order: readonly string[], stage: ProductionStage): boolean {
  return order.length > 0 && stage === order[order.length - 1];
}

/** The next stage in the given order, or null if already last/unknown. */
export function nextStage(
  order: readonly string[],
  stage: ProductionStage,
): ProductionStage | null {
  const i = order.indexOf(stage);
  if (i === -1 || i >= order.length - 1) return null;
  return order[i + 1];
}

/** The previous stage in the given order, or null if already first/unknown. */
export function prevStage(
  order: readonly string[],
  stage: ProductionStage,
): ProductionStage | null {
  const i = order.indexOf(stage);
  if (i <= 0) return null;
  return order[i - 1];
}

/**
 * The stage to display for a PO: the common stage if every line item shares
 * one, "mixed" if they diverge, or null when the PO has no line items.
 */
export function derivePoStage(
  stages: ProductionStage[],
): ProductionStage | "mixed" | null {
  if (stages.length === 0) return null;
  const first = stages[0];
  return stages.every((s) => s === first) ? first : "mixed";
}

export interface AdvanceTransition {
  lineItemId: string;
  from: ProductionStage;
  to: ProductionStage;
}

interface LineItemStage {
  id: string;
  currentStage: ProductionStage;
}

/**
 * Decide which line items move and to where when a PO is advanced.
 *
 * - Locked PO: every non-terminal line item advances one stage together.
 * - Broken PO (lockStagesTogether=false): only the targeted line item advances;
 *   a lineItemId is required.
 *
 * Line items already at the terminal stage produce no transition.
 */
export function planAdvance(params: {
  order: readonly string[];
  lockStagesTogether: boolean;
  lineItems: LineItemStage[];
  lineItemId?: string;
}): AdvanceTransition[] {
  const { order, lockStagesTogether, lineItems, lineItemId } = params;

  if (lockStagesTogether) {
    return lineItems.flatMap((li) => {
      const to = nextStage(order, li.currentStage);
      return to ? [{ lineItemId: li.id, from: li.currentStage, to }] : [];
    });
  }

  if (!lineItemId) {
    throw new Error(
      "lineItemId is required to advance a PO whose stages are not locked together",
    );
  }
  const li = lineItems.find((x) => x.id === lineItemId);
  if (!li) {
    throw new Error(`line item ${lineItemId} not found on this PO`);
  }
  const to = nextStage(order, li.currentStage);
  return to ? [{ lineItemId: li.id, from: li.currentStage, to }] : [];
}

/**
 * Decide transitions when a line item is moved directly to a target stage
 * (e.g. dragged on the kanban). Unlike planAdvance this allows jumping forward
 * or backward to any stage.
 *
 * - Locked PO: every line item moves to the target stage (kept in lock-step).
 * - Broken PO: only the dragged line item moves.
 *
 * Items already at the target stage produce no transition.
 */
export function planSetStage(params: {
  lockStagesTogether: boolean;
  lineItems: LineItemStage[];
  lineItemId: string;
  toStage: ProductionStage;
}): AdvanceTransition[] {
  const { lockStagesTogether, lineItems, lineItemId, toStage } = params;

  if (!lineItems.some((li) => li.id === lineItemId)) {
    throw new Error(`line item ${lineItemId} not found on this PO`);
  }

  const moving = lockStagesTogether
    ? lineItems
    : lineItems.filter((li) => li.id === lineItemId);

  return moving
    .filter((li) => li.currentStage !== toStage)
    .map((li) => ({ lineItemId: li.id, from: li.currentStage, to: toStage }));
}
