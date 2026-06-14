import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  influencer,
  influencerOrder,
  influencerOrderLineItem,
  influencerOrderAttachment,
  type InvoiceShipTo,
} from "@/lib/schema";
import { getCatalogCached } from "@/lib/catalog/load";
import { getShopifyClient } from "@/lib/shopify/client";
import {
  buildSplitShipping,
  shipToToShopify,
  getInfluencerAddresses,
} from "@/lib/portal/addresses";
import {
  computeGiftTotals,
  formatInfluencerOrderNumber,
  GIFT_DISCOUNT_PERCENT,
} from "./influencer";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date");

const today = () => new Date().toISOString().slice(0, 10);

/** Next gifting-order number from the sequence, formatted "GIFT-00100". */
async function nextOrderNumber(): Promise<string> {
  const seq = await db.execute(
    sql`SELECT nextval('influencer_order_number_seq')::int AS n`,
  );
  return formatInfluencerOrderNumber(Number((seq.rows[0] as { n: number }).n));
}

// ─── Influencer CRUD ────────────────────────────────────────────────

export const influencerSchema = z.object({
  name: z.string().min(1).max(200),
  handle: z.string().max(200).nullish(),
  platform: z.string().max(50).nullish(),
  contactName: z.string().max(200).nullish(),
  contactEmail: z.string().email().max(200).nullish().or(z.literal("")),
  customerId: z.string().max(200).nullish(),
  assignedCollectionIds: z.array(z.string().max(200)).nullish(),
  notes: z.string().max(5000).nullish(),
});
export type InfluencerInput = z.infer<typeof influencerSchema>;

export async function createInfluencer(
  input: InfluencerInput,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(influencer)
    .values({
      name: input.name,
      handle: input.handle || null,
      platform: input.platform || null,
      contactName: input.contactName || null,
      contactEmail: input.contactEmail || null,
      customerId: input.customerId || null,
      assignedCollectionIds: input.assignedCollectionIds ?? [],
      notes: input.notes || null,
    })
    .returning({ id: influencer.id });
  return { id: row.id };
}

export async function updateInfluencer(
  id: string,
  input: Partial<InfluencerInput>,
): Promise<{ id: string } | null> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.handle !== undefined) patch.handle = input.handle || null;
  if (input.platform !== undefined) patch.platform = input.platform || null;
  if (input.contactName !== undefined) patch.contactName = input.contactName || null;
  if (input.contactEmail !== undefined) patch.contactEmail = input.contactEmail || null;
  if (input.customerId !== undefined) patch.customerId = input.customerId || null;
  if (input.assignedCollectionIds !== undefined)
    patch.assignedCollectionIds = input.assignedCollectionIds ?? [];
  if (input.notes !== undefined) patch.notes = input.notes || null;

  const [row] = await db
    .update(influencer)
    .set(patch)
    .where(eq(influencer.id, id))
    .returning({ id: influencer.id });
  return row ?? null;
}

// ─── Orders ─────────────────────────────────────────────────────────

export const orderLineInputSchema = z.object({
  sku: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  shopifyProductId: z.string().max(200).nullish(),
  shopifyVariantId: z.string().max(200).nullish(),
});

export const createOrderSchema = z.object({
  influencerId: z.string().min(1),
  issuedDate: dateString.optional(),
  contentDueDate: dateString.nullish(),
  affiliateLink: z.string().url().max(2000).nullish().or(z.literal("")),
  notes: z.string().max(5000).nullish(),
  lineItems: z.array(orderLineInputSchema).min(1, "add at least one product"),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/**
 * Create a gifting order (100% off) for an influencer + its line items. The
 * caller (API route) creates the Shopify draft order first and passes its ids
 * in; this records the order with content-deadline + affiliate-link tracking.
 */
export async function recordInfluencerOrder(params: {
  influencerId: string;
  lineItems: CreateOrderInput["lineItems"];
  contentDueDate?: string | null;
  affiliateLink?: string | null;
  notes?: string | null;
  issuedDate?: string;
  shopifyDraftOrderId?: string | null;
  shopifyInvoiceUrl?: string | null;
}): Promise<{ id: string; orderNumber: string }> {
  const totals = computeGiftTotals(params.lineItems);
  const orderNumber = await nextOrderNumber();
  const hasDraft = !!params.shopifyDraftOrderId;

  // Unified creator system: carry the influencer's creator link onto the
  // order so /creators/[id] can list gifting orders directly.
  const inf = await db.query.influencer.findFirst({
    where: eq(influencer.id, params.influencerId),
    columns: { creatorId: true },
  });

  const [row] = await db
    .insert(influencerOrder)
    .values({
      orderNumber,
      influencerId: params.influencerId,
      creatorId: inf?.creatorId ?? null,
      status: hasDraft ? "sent" : "draft",
      issuedDate: params.issuedDate ?? today(),
      contentDueDate: params.contentDueDate ?? null,
      affiliateLink: params.affiliateLink || null,
      notes: params.notes ?? null,
      discountPercent: GIFT_DISCOUNT_PERCENT,
      shopifyDraftOrderId: params.shopifyDraftOrderId ?? null,
      shopifyInvoiceUrl: params.shopifyInvoiceUrl ?? null,
      sentAt: hasDraft ? new Date() : null,
      ...totals,
    })
    .returning({ id: influencerOrder.id });

  await db.insert(influencerOrderLineItem).values(
    params.lineItems.map((l) => ({
      orderId: row.id,
      sku: l.sku,
      title: l.title,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      shopifyProductId: l.shopifyProductId ?? null,
      shopifyVariantId: l.shopifyVariantId ?? null,
    })),
  );

  return { id: row.id, orderNumber };
}

/** All gifting orders (newest first) with influencer + line-item SKUs, for the
 *  Tracking list (deadline status is derived client/server-side from dates). */
export async function listInfluencerOrders() {
  return db.query.influencerOrder.findMany({
    orderBy: desc(influencerOrder.createdAt),
    with: {
      influencer: { columns: { name: true, handle: true } },
      lineItems: { columns: { sku: true } },
    },
  });
}

export const updateOrderSchema = z.object({
  contentDueDate: dateString.nullable().optional(),
  publishedAt: dateString.nullable().optional(),
  affiliateLink: z.string().url().max(2000).nullable().or(z.literal("")).optional(),
  status: z.enum(["draft", "sent", "cancelled"]).optional(),
  // Sample logistics — manual fallback when carrier data doesn't flow
  // (webhooks stamp these automatically when Shopify has the facts).
  shippedAt: dateString.nullable().optional(),
  deliveredAt: dateString.nullable().optional(),
  trackingNumber: z.string().max(200).nullable().optional(),
  expectedPlatform: z.enum(["ig", "yt", "tt", "other"]).nullable().optional(),
});
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

/** Edit deadline / published date / affiliate link / status on an order. */
export async function updateInfluencerOrder(
  id: string,
  input: UpdateOrderInput,
): Promise<{ id: string } | null> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.contentDueDate !== undefined) patch.contentDueDate = input.contentDueDate;
  if (input.publishedAt !== undefined) patch.publishedAt = input.publishedAt;
  if (input.affiliateLink !== undefined) patch.affiliateLink = input.affiliateLink || null;
  if (input.status !== undefined) patch.status = input.status;
  if (input.shippedAt !== undefined)
    patch.shippedAt = input.shippedAt ? new Date(input.shippedAt) : null;
  if (input.deliveredAt !== undefined)
    patch.deliveredAt = input.deliveredAt ? new Date(input.deliveredAt) : null;
  if (input.trackingNumber !== undefined) patch.trackingNumber = input.trackingNumber;
  if (input.expectedPlatform !== undefined) patch.expectedPlatform = input.expectedPlatform;

  const [row] = await db
    .update(influencerOrder)
    .set(patch)
    .where(eq(influencerOrder.id, id))
    .returning({ id: influencerOrder.id });
  return row ?? null;
}
