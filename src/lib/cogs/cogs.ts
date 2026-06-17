import { and, eq, gte, lte, sql, sum } from "drizzle-orm";
import { db } from "@/lib/db";
import { order, orderLineItem } from "@/lib/schema";
import { getAverageUnitCostBySku } from "./average-cost";
import { computeCogsRows, type CogsReport, type SkuSales } from "./compute";

export type { CogsReport, CogsRow, SkuSales } from "./compute";
export { computeCogsRows } from "./compute";

/**
 * COGS report for a date range: units actually sold (order line items, sample
 * orders excluded) valued at each SKU's quantity-weighted average PO cost.
 * Sales are bounded by `order.processed_at`, matching the rest of the admin.
 */
export async function getCogs(range: {
  from: Date;
  to: Date;
}): Promise<CogsReport> {
  const salesRows = await db
    .select({
      sku: orderLineItem.sku,
      title: sql<string>`max(${orderLineItem.title})`,
      unitsSold: sum(orderLineItem.quantity).mapWith(Number),
      revenueCents: sql<number>`coalesce(sum(${orderLineItem.price} * ${orderLineItem.quantity}), 0)::int`,
    })
    .from(orderLineItem)
    .innerJoin(order, eq(order.id, orderLineItem.orderId))
    .where(
      and(
        gte(order.processedAt, range.from),
        lte(order.processedAt, range.to),
        eq(order.isSample, false),
      ),
    )
    .groupBy(orderLineItem.sku);

  const costBySku = await getAverageUnitCostBySku();

  const sales: SkuSales[] = salesRows
    .filter((r): r is typeof r & { sku: string } => Boolean(r.sku))
    .map((r) => ({
      sku: r.sku,
      title: r.title ?? r.sku,
      unitsSold: Number(r.unitsSold ?? 0),
      revenueCents: Number(r.revenueCents ?? 0),
    }));

  return computeCogsRows(sales, costBySku);
}
