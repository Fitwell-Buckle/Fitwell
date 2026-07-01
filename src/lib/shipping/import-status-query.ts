/**
 * DB query for shipping-import freshness. Split out of import-status.ts so the
 * pure helpers there (used by the client ShippingCostReminder banner) don't drag
 * `@/lib/db` into the browser bundle — a client-side `neon()` crash. Server-only.
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { shippingCharge } from "@/lib/schema";
import type { ShippingImportStatus } from "./import-status";

export async function getShippingImportStatus(): Promise<ShippingImportStatus> {
  const [row] = await db
    .select({
      last: sql<string | null>`max(${shippingCharge.importedAt})`,
      n: sql<number>`count(*)::int`,
    })
    .from(shippingCharge);
  return {
    lastImportedAt: row?.last ? new Date(row.last) : null,
    totalCharges: row?.n ?? 0,
  };
}
