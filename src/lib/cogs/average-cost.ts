import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  invoice,
  productionPo,
  productionPoLineItem,
  productionSupplierLineCost,
} from "@/lib/schema";
import { computeWeightedAvgCost, type CostLine, type SkuCost } from "./compute";

export type { CostLine, SkuCost } from "./compute";
export { computeWeightedAvgCost } from "./compute";

/**
 * Quantity-weighted average unit cost per SKU, from production PO lines that
 * count as a recognized cost basis.
 *
 * A PO line is **cost-eligible** when its PO is not cancelled AND either:
 *   (a) the line is physically received (`shopify_received_at` set), or
 *   (b) the PO is linked from a **paid** invoice (`invoice.source_po_id` →
 *       this PO, `invoice.status = 'paid'`). Customers routinely pay in
 *       advance of arrival; we recognize that cost as soon as the money lands.
 *
 * Effective per-unit cost mirrors `src/lib/production/receive.ts`: on a
 * multi-supplier PO it's the SUM of each supplier's unit cost for the line
 * (`production_supplier_line_cost`); otherwise the line's own `unit_cost_cents`.
 */
export async function getAverageUnitCostBySku(): Promise<Map<string, SkuCost>> {
  // (b) above — correlated against the outer production_po row.
  const paidInvoiceExists = sql`EXISTS (
    SELECT 1 FROM ${invoice}
    WHERE ${invoice.sourcePoId} = ${productionPo.id}
      AND ${invoice.status} = 'paid'
  )`;

  const lineRows = await db
    .select({
      id: productionPoLineItem.id,
      sku: productionPoLineItem.sku,
      quantity: productionPoLineItem.quantity,
      unitCostCents: productionPoLineItem.unitCostCents,
    })
    .from(productionPoLineItem)
    .innerJoin(productionPo, eq(productionPoLineItem.poId, productionPo.id))
    .where(
      and(
        ne(productionPo.status, "cancelled"),
        or(isNotNull(productionPoLineItem.shopifyReceivedAt), paidInvoiceExists),
      ),
    );

  // Multi-supplier rollup: per line, SUM each supplier's recorded unit cost.
  // `recorded` counts non-null rows so we can tell "supplier costs exist" from
  // "no rows / all null" and fall back to the line's own cost in the latter.
  const supplierCostRows = await db
    .select({
      lineItemId: productionSupplierLineCost.lineItemId,
      total:
        sql<number>`coalesce(sum(${productionSupplierLineCost.unitCostCents}), 0)`.mapWith(
          Number,
        ),
      recorded:
        sql<number>`count(${productionSupplierLineCost.unitCostCents})`.mapWith(
          Number,
        ),
    })
    .from(productionSupplierLineCost)
    .groupBy(productionSupplierLineCost.lineItemId);
  const supplierByLine = new Map(supplierCostRows.map((r) => [r.lineItemId, r]));

  const lines: CostLine[] = lineRows.map((r) => {
    const s = supplierByLine.get(r.id);
    const effective = s && s.recorded > 0 ? s.total : r.unitCostCents;
    return { sku: r.sku, quantity: r.quantity, unitCostCents: effective };
  });

  return computeWeightedAvgCost(lines);
}
