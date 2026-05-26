import { STAGES, type ProductionStage } from "./stages";

// Per-PO stage ownership resolution. An explicit assignment wins; any stage
// without one falls back to the PO's primary supplier. Pure, so it's unit
// tested directly and reused by the admin editor + supplier portal + the
// handoff/notification logic.

export interface StageAssignment {
  stage: ProductionStage;
  supplierId: string;
}

// The opening "supplier_po" state isn't a manufacturing step — it belongs to
// whoever starts the first real stage (stamping), so the kickoff sits inside
// that supplier's sub-PO (contiguous with their work) rather than the primary
// supplier's. Without this, splitting off just stamping leaves the primary
// owning a non-contiguous [supplier_po, edm…] set and the PO stalls.
const OPENING_STAGE: ProductionStage = "supplier_po";
const FIRST_WORK_STAGE: ProductionStage = "stamping";

/** Which supplier owns `stage` on this PO (assignment override, else default). */
export function supplierForStage(
  assignments: StageAssignment[],
  defaultSupplierId: string | null,
  stage: ProductionStage,
): string | null {
  const effective = stage === OPENING_STAGE ? FIRST_WORK_STAGE : stage;
  return (
    assignments.find((a) => a.stage === effective)?.supplierId ?? defaultSupplierId
  );
}

/** Does `supplierId` own `stage` on this PO? */
export function supplierOwnsStage(
  assignments: StageAssignment[],
  defaultSupplierId: string | null,
  supplierId: string | null | undefined,
  stage: ProductionStage,
): boolean {
  return (
    !!supplierId &&
    supplierForStage(assignments, defaultSupplierId, stage) === supplierId
  );
}

/** The stages a supplier owns on this PO, in pipeline order. */
export function stagesOwnedBySupplier(
  assignments: StageAssignment[],
  defaultSupplierId: string | null,
  supplierId: string | null | undefined,
): ProductionStage[] {
  if (!supplierId) return [];
  return STAGES.filter(
    (s) => supplierForStage(assignments, defaultSupplierId, s) === supplierId,
  );
}

/** Whether a supplier owns at least one stage on this PO (portal access gate). */
export function supplierHasAnyStage(
  assignments: StageAssignment[],
  defaultSupplierId: string | null,
  supplierId: string | null | undefined,
): boolean {
  return stagesOwnedBySupplier(assignments, defaultSupplierId, supplierId).length > 0;
}

/**
 * True when a supplier advancing a line from `fromStage` to `toStage` is
 * handing it off — i.e. they owned the stage it's leaving but not the one it's
 * entering. This is the moment we notify the admins.
 */
export function isHandoff(
  assignments: StageAssignment[],
  defaultSupplierId: string | null,
  supplierId: string | null | undefined,
  fromStage: ProductionStage,
  toStage: ProductionStage,
): boolean {
  return (
    supplierOwnsStage(assignments, defaultSupplierId, supplierId, fromStage) &&
    !supplierOwnsStage(assignments, defaultSupplierId, supplierId, toStage)
  );
}
