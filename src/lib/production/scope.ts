import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  productionPo,
  productionPoLineItem,
} from "@/lib/schema";
import { canSupplierAccessPo } from "@/lib/supplier-access";
import {
  supplierHasAnyStage,
  supplierOwnsStage,
  type StageAssignment,
} from "./stage-owners";
import type { ProductionStage } from "./stages";

// NOTE: this module must NOT import `@/lib/auth` (NextAuth). It's exercised by
// the isolation integration test under plain vitest, where next-auth can't
// resolve `next/server`. The session-bound helper lives in supplier-session.ts.

/** The owning (primary) supplier of a PO (null if the PO doesn't exist). */
export async function poSupplierId(poId: string): Promise<string | null> {
  const row = await db.query.productionPo.findFirst({
    where: eq(productionPo.id, poId),
    columns: { supplierId: true },
  });
  return row?.supplierId ?? null;
}

/** The owning (primary) supplier of the PO a line item belongs to. */
export async function lineItemPoSupplierId(
  lineItemId: string,
): Promise<string | null> {
  const li = await db.query.productionPoLineItem.findFirst({
    where: eq(productionPoLineItem.id, lineItemId),
    columns: { poId: true },
  });
  if (!li) return null;
  return poSupplierId(li.poId);
}

/** A PO's primary supplier + its per-stage assignments. */
async function poOwnership(
  poId: string,
): Promise<{ supplierId: string | null; assignments: StageAssignment[] } | null> {
  const po = await db.query.productionPo.findFirst({
    where: eq(productionPo.id, poId),
    columns: { supplierId: true },
    with: {
      stageAssignments: { columns: { stage: true, supplierId: true } },
    },
  });
  if (!po) return null;
  return { supplierId: po.supplierId, assignments: po.stageAssignments };
}

type Denial = { error: string; status: number };
type SessionLike = {
  user?: { id?: string; role?: string; supplierId?: string | null };
} | null;

/**
 * Guard a PO-level write. Admins (role !== "supplier") always pass; a supplier
 * passes if they're the PO's primary supplier OR own at least one of its
 * stages. (A primary supplier with no assignments owns every unassigned stage,
 * so existing single-supplier POs are unaffected.)
 */
export async function ensureSupplierMayActOnPo(
  session: SessionLike,
  poId: string,
): Promise<Denial | null> {
  if (!session?.user) return { error: "Unauthorized", status: 401 };
  if (session.user.role !== "supplier") return null;
  const own = await poOwnership(poId);
  if (!own) return { error: "Forbidden", status: 403 };
  const me = session.user.supplierId;
  if (
    canSupplierAccessPo(own.supplierId, me) ||
    supplierHasAnyStage(own.assignments, own.supplierId, me)
  ) {
    return null;
  }
  return { error: "Forbidden", status: 403 };
}

/**
 * Guard a line-item stage write. Admins pass. A supplier may move a line item
 * only when they own its CURRENT stage — so each vendor advances only their own
 * step (and can hand it off to the next).
 */
export async function ensureSupplierMayActOnLineItem(
  session: SessionLike,
  lineItemId: string,
): Promise<Denial | null> {
  if (!session?.user) return { error: "Unauthorized", status: 401 };
  if (session.user.role !== "supplier") return null;
  const li = await db.query.productionPoLineItem.findFirst({
    where: eq(productionPoLineItem.id, lineItemId),
    columns: { poId: true, currentStage: true },
  });
  if (!li) return { error: "Forbidden", status: 403 };
  const own = await poOwnership(li.poId);
  if (!own) return { error: "Forbidden", status: 403 };
  if (
    supplierOwnsStage(
      own.assignments,
      own.supplierId,
      session.user.supplierId,
      li.currentStage as ProductionStage,
    )
  ) {
    return null;
  }
  return { error: "Forbidden", status: 403 };
}
