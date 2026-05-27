import type { ProductionStage } from "./stages";

// Per-PO stage ownership resolution. An explicit assignment wins; any stage
// without one falls back to the PO's primary supplier. Pure, so it's unit
// tested directly and reused by the admin editor + supplier portal + the
// handoff/notification logic.
//
// The opening stage (pipeline position 0) isn't a manufacturing step — it
// belongs to whoever starts the first real stage (position 1), so the kickoff
// sits inside that supplier's sub-PO (contiguous with their work) rather than
// the primary supplier's. Without this, splitting off just the first work stage
// leaves the primary owning a non-contiguous [opening, …] set and the PO stalls.

export interface StageAssignment {
  stage: ProductionStage;
  supplierId: string;
}

/** Fold the opening stage onto the first work stage for ownership purposes. */
function effectiveStage(order: readonly string[], stage: ProductionStage): ProductionStage {
  return order.length > 1 && stage === order[0] ? order[1] : stage;
}

/** Which supplier owns `stage` on this PO (assignment override, else default). */
export function supplierForStage(
  order: readonly string[],
  assignments: StageAssignment[],
  defaultSupplierId: string | null,
  stage: ProductionStage,
): string | null {
  const effective = effectiveStage(order, stage);
  return (
    assignments.find((a) => a.stage === effective)?.supplierId ?? defaultSupplierId
  );
}

/** Does `supplierId` own `stage` on this PO? */
export function supplierOwnsStage(
  order: readonly string[],
  assignments: StageAssignment[],
  defaultSupplierId: string | null,
  supplierId: string | null | undefined,
  stage: ProductionStage,
): boolean {
  return (
    !!supplierId &&
    supplierForStage(order, assignments, defaultSupplierId, stage) === supplierId
  );
}

/** The stages a supplier owns on this PO, in pipeline order. */
export function stagesOwnedBySupplier(
  order: readonly string[],
  assignments: StageAssignment[],
  defaultSupplierId: string | null,
  supplierId: string | null | undefined,
): ProductionStage[] {
  if (!supplierId) return [];
  return order.filter(
    (s) => supplierForStage(order, assignments, defaultSupplierId, s) === supplierId,
  );
}

/** Whether a supplier owns at least one stage on this PO (portal access gate). */
export function supplierHasAnyStage(
  order: readonly string[],
  assignments: StageAssignment[],
  defaultSupplierId: string | null,
  supplierId: string | null | undefined,
): boolean {
  return stagesOwnedBySupplier(order, assignments, defaultSupplierId, supplierId).length > 0;
}

/**
 * True when a supplier advancing a line from `fromStage` to `toStage` is
 * handing it off — i.e. they owned the stage it's leaving but not the one it's
 * entering. This is the moment we notify the admins.
 */
export function isHandoff(
  order: readonly string[],
  assignments: StageAssignment[],
  defaultSupplierId: string | null,
  supplierId: string | null | undefined,
  fromStage: ProductionStage,
  toStage: ProductionStage,
): boolean {
  return (
    supplierOwnsStage(order, assignments, defaultSupplierId, supplierId, fromStage) &&
    !supplierOwnsStage(order, assignments, defaultSupplierId, supplierId, toStage)
  );
}
