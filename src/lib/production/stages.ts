// Pure, DB-free stage logic for the production module. Kept side-effect-free so
// the advance rules (locked vs broken POs) can be unit tested in isolation.

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

export type ProductionStage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<ProductionStage, string> = {
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

export function isComplete(stage: ProductionStage): boolean {
  return stage === "complete";
}

/** The next stage in the fixed progression, or null if already complete. */
export function nextStage(stage: ProductionStage): ProductionStage | null {
  const i = STAGES.indexOf(stage);
  if (i === -1 || i >= STAGES.length - 1) return null;
  return STAGES[i + 1];
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
 * - Locked PO: every non-complete line item advances one stage together.
 * - Broken PO (lockStagesTogether=false): only the targeted line item advances;
 *   a lineItemId is required.
 *
 * Line items already at "complete" produce no transition. Returns the planned
 * transitions without mutating anything.
 */
export function planAdvance(params: {
  lockStagesTogether: boolean;
  lineItems: LineItemStage[];
  lineItemId?: string;
}): AdvanceTransition[] {
  const { lockStagesTogether, lineItems, lineItemId } = params;

  if (lockStagesTogether) {
    return lineItems.flatMap((li) => {
      const to = nextStage(li.currentStage);
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
  const to = nextStage(li.currentStage);
  return to ? [{ lineItemId: li.id, from: li.currentStage, to }] : [];
}
