import { and, eq, inArray, isNull, isNotNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { productionPo, productionStageAssignment } from "@/lib/schema";
import { terminalStage } from "./stages";
import { getStageOrder } from "./stage-labels";
import { stagesOwnedBySupplier } from "./stage-owners";
import { formatPoNumber } from "./sub-po";

export interface MissingEtaPo {
  poId: string;
  /** Display number with the supplier's sub-PO suffix when applicable. */
  poNumber: string;
  /** Count of this supplier's owned, unreceived line items without a Final ETA. */
  missingCount: number;
}

/**
 * The POs (master, scoped to this supplier) that still have line items the
 * supplier owns — current stage owned by them, not yet received — without an
 * `expected_completion_date`. Shared by the dashboard login nudge and the
 * reminder cron so the "missing ETA" definition lives in one place.
 */
export async function listSupplierMissingEtas(
  supplierId: string,
): Promise<MissingEtaPo[]> {
  const order = await getStageOrder();
  const terminal = terminalStage(order);

  // POs this supplier is involved in: their own OR ones where they own a stage.
  // Masters only — suppliers work the master scoped to their stages.
  const assigned = await db
    .select({ poId: productionStageAssignment.poId })
    .from(productionStageAssignment)
    .where(eq(productionStageAssignment.supplierId, supplierId));
  const assignedPoIds = [...new Set(assigned.map((a) => a.poId))];
  const involvement = assignedPoIds.length
    ? or(
        eq(productionPo.supplierId, supplierId),
        inArray(productionPo.id, assignedPoIds),
      )
    : eq(productionPo.supplierId, supplierId);

  const pos = await db.query.productionPo.findMany({
    where: and(isNull(productionPo.parentPoId), involvement),
    with: {
      lineItems: {
        columns: {
          currentStage: true,
          expectedCompletionDate: true,
          shopifyReceivedAt: true,
        },
      },
      stageAssignments: { columns: { stage: true, supplierId: true } },
    },
  });

  // The supplier's sub-PO suffix per master, for the display number.
  const mySubPos = await db
    .select({
      parentPoId: productionPo.parentPoId,
      poSuffix: productionPo.poSuffix,
    })
    .from(productionPo)
    .where(
      and(
        eq(productionPo.supplierId, supplierId),
        isNotNull(productionPo.parentPoId),
      ),
    );
  const suffixByMaster = new Map(
    mySubPos.map((s) => [s.parentPoId, s.poSuffix] as const),
  );

  const result: MissingEtaPo[] = [];
  for (const po of pos) {
    const ownedSet = new Set(
      stagesOwnedBySupplier(
        order,
        po.stageAssignments,
        po.supplierId,
        supplierId,
      ).filter((s) => s !== terminal),
    );
    const missingCount = po.lineItems.filter(
      (li) =>
        ownedSet.has(li.currentStage) &&
        !li.shopifyReceivedAt &&
        !li.expectedCompletionDate,
    ).length;
    if (missingCount > 0) {
      result.push({
        poId: po.id,
        poNumber: formatPoNumber(po.shopifyPoNumber, {
          suffix: suffixByMaster.get(po.id) ?? undefined,
        }),
        missingCount,
      });
    }
  }
  return result;
}
