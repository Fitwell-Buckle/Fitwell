import { auth } from "@/lib/auth";

export type SupplierScope = { userId: string; supplierId: string };

/**
 * The current session as a supplier scope, or null if the caller isn't a
 * signed-in supplier with a linked supplier_id. Pages in /supplier use this to
 * gate the portal. Kept separate from scope.ts so the DB scope helpers (used by
 * API routes and the isolation integration test) don't pull in NextAuth, which
 * can't load under plain vitest.
 */
export async function getSupplierScope(): Promise<SupplierScope | null> {
  const session = await auth();
  const u = session?.user;
  if (!u || u.role !== "supplier" || !u.supplierId) return null;
  return { userId: u.id, supplierId: u.supplierId };
}
