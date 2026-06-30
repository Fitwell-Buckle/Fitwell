/**
 * Unit cost per SKU for COGS / margin, blending two sources:
 *   1. Recognized production-PO cost (received or paid-by-invoice) — actual cost.
 *   2. Standard cost (src/lib/cogs/standard-cost.ts) — Tom's per-material
 *      estimates, used as a fallback for SKUs with no recognized PO cost yet.
 *
 * Recognized PO cost always wins; standard cost only fills gaps. Returned as the
 * same `SkuCost` shape `getAverageUnitCostBySku` produces, so it's a drop-in for
 * `computeCogsRows` and the margin loader.
 */
import { db } from "@/lib/db";
import { orderLineItem } from "@/lib/schema";
import { isNotNull, sql } from "drizzle-orm";
import { getAverageUnitCostBySku } from "./average-cost";
import { standardUnitCostCents } from "./standard-cost";
import type { SkuCost } from "./compute";

/**
 * Standard cost per sold SKU, classified from a representative title/variant.
 * Keyed by SKU (cents). SKUs that can't be classified are absent.
 */
export async function getStandardCostBySku(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      sku: orderLineItem.sku,
      title: sql<string>`max(${orderLineItem.title})`,
      variant: sql<string>`max(${orderLineItem.variantTitle})`,
    })
    .from(orderLineItem)
    .where(isNotNull(orderLineItem.sku))
    .groupBy(orderLineItem.sku);

  const map = new Map<string, number>();
  for (const r of rows) {
    if (!r.sku) continue;
    const cents = standardUnitCostCents(r.title, r.variant, r.sku);
    if (cents != null) map.set(r.sku, cents);
  }
  return map;
}

/** Which source a SKU's cost came from. */
export type CostBasisSource = "po" | "standard";

export async function getCostBasisBySku(): Promise<Map<string, SkuCost>> {
  const [recognized, standard] = await Promise.all([
    getAverageUnitCostBySku(),
    getStandardCostBySku(),
  ]);

  const map = new Map<string, SkuCost>();
  for (const [sku, cents] of standard) {
    map.set(sku, { sku, avgUnitCostCents: cents, unitsCosted: 0, lineCount: 0 });
  }
  // Recognized PO cost overrides the standard estimate.
  for (const [sku, c] of recognized) {
    map.set(sku, c);
  }
  return map;
}
