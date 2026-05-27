import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  productionPo,
  productionPoLineItem,
  productionSupplierLineCost,
} from "@/lib/schema";
import { getShopifyClient } from "@/lib/shopify/client";
import { planReceiveLine, type ReceiveLineStatus } from "./receive-plan";
import { getStageOrder } from "./stage-labels";
import { terminalStage } from "./stages";

export interface ReceiveResult {
  poId: string;
  /** True once every line item is received (PO-level shopify_received_at set). */
  poFullyReceived: boolean;
  received: { lineItemId: string; sku: string; available?: number | null }[];
  skipped: { lineItemId: string; sku: string; status: ReceiveLineStatus }[];
  failed: { lineItemId: string; sku: string; error: string }[];
}

/**
 * Push a complete PO's inventory into Shopify (C2). For each line that's ready
 * (complete, has a variant + warehouse, not already received) we post an
 * inventory adjustment of +qty to its effective warehouse and stamp the line's
 * shopify_received_at — so a retry never double-counts. Lines that aren't ready
 * are reported, not pushed. When every line is received, the PO-level
 * shopify_received_at is set.
 *
 * neon-http has no multi-statement transactions, so adjustments are applied
 * sequentially; the per-line timestamp is the idempotency guard.
 */
export async function receivePo(poId: string): Promise<ReceiveResult> {
  const po = await db.query.productionPo.findFirst({
    where: eq(productionPo.id, poId),
    with: { lineItems: true },
  });
  if (!po) throw new Error(`production PO ${poId} not found`);

  const received: ReceiveResult["received"] = [];
  const skipped: ReceiveResult["skipped"] = [];
  const failed: ReceiveResult["failed"] = [];

  // Per-line unit cost to push into Shopify's cost basis: on a multi-supplier
  // master this is the SUM of each supplier's unit cost for the line (the Total
  // Cost rollup ÷ qty); standalone POs fall back to the line's own unit cost.
  const costRows = await db
    .select({
      lineItemId: productionSupplierLineCost.lineItemId,
      unitCostCents: productionSupplierLineCost.unitCostCents,
    })
    .from(productionSupplierLineCost)
    .where(eq(productionSupplierLineCost.poId, poId));
  const supplierUnitByLine = new Map<string, number>();
  for (const r of costRows) {
    if (r.unitCostCents != null) {
      supplierUnitByLine.set(
        r.lineItemId,
        (supplierUnitByLine.get(r.lineItemId) ?? 0) + r.unitCostCents,
      );
    }
  }

  const client = getShopifyClient();
  const terminal = terminalStage(await getStageOrder());
  const now = new Date();

  for (const li of po.lineItems) {
    const plan = planReceiveLine(
      {
        id: li.id,
        currentStage: li.currentStage,
        quantity: li.quantity,
        shopifyVariantId: li.shopifyVariantId,
        shopifyReceivedAt: li.shopifyReceivedAt,
        effectiveLocationId: li.shopifyLocationId ?? po.shopifyLocationId,
      },
      terminal,
    );

    if (plan.status === "already_received") {
      received.push({ lineItemId: li.id, sku: li.sku });
      continue;
    }
    if (plan.status !== "ready") {
      skipped.push({ lineItemId: li.id, sku: li.sku, status: plan.status });
      continue;
    }

    try {
      const { available } = await client.adjustInventory({
        variantId: plan.variantId!,
        locationId: plan.locationId!,
        delta: plan.quantity,
        // Stamp the PO number onto the Shopify adjustment (referenceDocumentUri).
        reference: `https://admin.fitwellbuckle.co/po/${po.shopifyPoNumber}`,
        // Total Cost ÷ qty = the line's unit cost basis for Shopify.
        costCents: supplierUnitByLine.get(li.id) ?? li.unitCostCents ?? null,
      });
      await db
        .update(productionPoLineItem)
        .set({ shopifyReceivedAt: now, updatedAt: now })
        .where(eq(productionPoLineItem.id, li.id));
      received.push({ lineItemId: li.id, sku: li.sku, available });
    } catch (err) {
      failed.push({
        lineItemId: li.id,
        sku: li.sku,
        error: err instanceof Error ? err.message : "Inventory adjustment failed",
      });
    }
  }

  // Fully received only when nothing was skipped or failed and every line landed.
  const poFullyReceived =
    skipped.length === 0 &&
    failed.length === 0 &&
    received.length === po.lineItems.length &&
    po.lineItems.length > 0;

  if (poFullyReceived && !po.shopifyReceivedAt) {
    await db
      .update(productionPo)
      .set({ shopifyReceivedAt: now, updatedAt: now })
      .where(eq(productionPo.id, poId));
  }

  return { poId, poFullyReceived, received, skipped, failed };
}
