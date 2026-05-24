import type { ProductionStage } from "./stages";

/**
 * Per-line receiving status (C2). A line is `ready` to push to Shopify only
 * when it's complete, has a variant to adjust, an effective warehouse to adjust
 * at, and hasn't already been received. Everything else is reported so the UI
 * can explain why a line was skipped. Pure so the rules are unit-tested.
 */
export type ReceiveLineStatus =
  | "ready"
  | "already_received"
  | "not_ready" // still in production (not at the complete stage)
  | "no_variant" // no shopify_variant_id to adjust (manual line)
  | "no_warehouse"; // no effective location to adjust at

export interface ReceiveLineInput {
  id: string;
  currentStage: ProductionStage;
  quantity: number;
  shopifyVariantId: string | null;
  shopifyReceivedAt: Date | null;
  /** li.shopifyLocationId ?? po.shopifyLocationId */
  effectiveLocationId: string | null;
}

export interface ReceivePlanLine {
  lineItemId: string;
  status: ReceiveLineStatus;
  variantId: string | null;
  locationId: string | null;
  quantity: number;
}

export function planReceiveLine(li: ReceiveLineInput): ReceivePlanLine {
  const base = {
    lineItemId: li.id,
    variantId: li.shopifyVariantId,
    locationId: li.effectiveLocationId,
    quantity: li.quantity,
  };
  if (li.shopifyReceivedAt) return { ...base, status: "already_received" };
  if (li.currentStage !== "complete") return { ...base, status: "not_ready" };
  if (!li.shopifyVariantId) return { ...base, status: "no_variant" };
  if (!li.effectiveLocationId) return { ...base, status: "no_warehouse" };
  return { ...base, status: "ready" };
}
