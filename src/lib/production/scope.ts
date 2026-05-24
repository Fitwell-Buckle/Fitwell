import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { productionPo, productionPoLineItem } from "@/lib/schema";
import { canSupplierAccessPo } from "@/lib/supplier-access";

// NOTE: this module must NOT import `@/lib/auth` (NextAuth). It's exercised by
// the isolation integration test under plain vitest, where next-auth can't
// resolve `next/server`. The session-bound helper lives in supplier-session.ts.

/** The owning supplier of a PO (null if the PO doesn't exist). */
export async function poSupplierId(poId: string): Promise<string | null> {
  const row = await db.query.productionPo.findFirst({
    where: eq(productionPo.id, poId),
    columns: { supplierId: true },
  });
  return row?.supplierId ?? null;
}

/** The owning supplier of the PO a line item belongs to (null if missing). */
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

type Denial = { error: string; status: number };
type SessionLike = {
  user?: { id?: string; role?: string; supplierId?: string | null };
} | null;

/**
 * Guard a production write against the PO's owning supplier. Admins (role !==
 * "supplier") always pass; suppliers pass only for their own PO. Returns null
 * when authorized, or an { error, status } to respond with. The ownership query
 * runs only for supplier sessions, so admin requests pay nothing extra.
 */
export async function ensureSupplierMayActOnPo(
  session: SessionLike,
  poId: string,
): Promise<Denial | null> {
  if (!session?.user) return { error: "Unauthorized", status: 401 };
  if (session.user.role !== "supplier") return null;
  const owner = await poSupplierId(poId);
  if (canSupplierAccessPo(owner, session.user.supplierId)) return null;
  return { error: "Forbidden", status: 403 };
}

/** Same as `ensureSupplierMayActOnPo`, but keyed by a line item id. */
export async function ensureSupplierMayActOnLineItem(
  session: SessionLike,
  lineItemId: string,
): Promise<Denial | null> {
  if (!session?.user) return { error: "Unauthorized", status: 401 };
  if (session.user.role !== "supplier") return null;
  const owner = await lineItemPoSupplierId(lineItemId);
  if (canSupplierAccessPo(owner, session.user.supplierId)) return null;
  return { error: "Forbidden", status: 403 };
}
