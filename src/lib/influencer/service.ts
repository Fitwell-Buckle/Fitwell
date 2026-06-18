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
import { GIFT_ORDER_TAGS } from "@/lib/shopify/order-tags";
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

/** A line plus an optional split-fulfillment ship-to id (a saved address). The
 *  route resolves the id to a stable snapshot before persisting. Shared by the
 *  create form and the edit form so both carry per-line ship-to identically. */
export const editOrderLineSchema = orderLineInputSchema.extend({
  addressId: z.string().max(200).nullish(),
});

export const createOrderSchema = z.object({
  influencerId: z.string().min(1),
  issuedDate: dateString.optional(),
  contentDueDate: dateString.nullish(),
  affiliateLink: z.string().url().max(2000).nullish().or(z.literal("")),
  notes: z.string().max(5000).nullish(),
  // Order-level default ship-to address id (a saved address). null = none.
  addressId: z.string().max(200).nullish(),
  lineItems: z.array(editOrderLineSchema).min(1, "add at least one product"),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/**
 * Create a gifting order (100% off) for an influencer + its line items. The
 * caller (API route) creates the Shopify draft order first and passes its ids
 * in; this records the order with content-deadline + affiliate-link tracking.
 */
export async function recordInfluencerOrder(params: {
  influencerId: string;
  /** Lines with resolved per-line ship-to snapshots (split fulfillment). */
  lineItems: SaveInfluencerLine[];
  /** Resolved order-level default ship-to snapshot. */
  shipTo?: InvoiceShipTo | null;
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
      shipTo: params.shipTo ?? null,
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
      shipTo: l.shipTo ?? null,
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
  trackingUrl: z.string().url().max(2000).nullable().or(z.literal("")).optional(),
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
  if (input.trackingUrl !== undefined) patch.trackingUrl = input.trackingUrl || null;
  if (input.expectedPlatform !== undefined) patch.expectedPlatform = input.expectedPlatform;

  const [row] = await db
    .update(influencerOrder)
    .set(patch)
    .where(eq(influencerOrder.id, id))
    .returning({ id: influencerOrder.id });
  return row ?? null;
}

// ─── Order detail (host for the edit page) ──────────────────────────

/**
 * Full gifting-order detail: the order + its influencer (and linked Shopify
 * customer), line items, attachments, and the addresses available to gift to
 * (the linked customer's, via the shared address pipeline). Mirrors
 * `getInvoiceDetail` so the influencer edit page reads like the invoice one.
 * Returns `undefined` when the order doesn't exist.
 */
export async function getInfluencerOrderDetail(id: string) {
  const ord = await db.query.influencerOrder.findFirst({
    where: eq(influencerOrder.id, id),
    with: {
      influencer: {
        columns: {
          id: true,
          name: true,
          handle: true,
          contactEmail: true,
          customerId: true,
          assignedCollectionIds: true,
        },
        with: { customer: { columns: { id: true, shopifyId: true } } },
      },
      lineItems: true,
      attachments: {
        columns: {
          id: true,
          blobUrl: true,
          filename: true,
          contentType: true,
          sizeBytes: true,
          uploadedAt: true,
        },
        orderBy: (a, { desc }) => desc(a.uploadedAt),
      },
    },
  });
  if (!ord) return ord;
  const addresses = ord.influencerId
    ? await getInfluencerAddresses(ord.influencerId)
    : [];
  return { ...ord, addresses };
}

/** Record a document (gifting agreement, content brief) on a gifting order. */
export async function addInfluencerOrderAttachment(input: {
  orderId: string;
  blobUrl: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number;
  uploadedByUserId?: string | null;
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(influencerOrderAttachment)
    .values({
      orderId: input.orderId,
      blobUrl: input.blobUrl,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      uploadedByUserId: input.uploadedByUserId ?? null,
    })
    .returning({ id: influencerOrderAttachment.id });
  return row;
}

// ─── Line editing (full-parity edit page) ───────────────────────────

/** Edit payload: the full replacement line set + an order-level ship-to id. */
export const saveOrderLinesSchema = z.object({
  lineItems: z.array(editOrderLineSchema).min(1, "add at least one product"),
  addressId: z.string().max(200).nullish(),
});
export type SaveOrderLinesInput = z.infer<typeof saveOrderLinesSchema>;

/** One resolved line ready to persist (ship-to id already → snapshot). */
export type SaveInfluencerLine = {
  sku: string;
  title: string;
  quantity: number;
  unitPriceCents: number;
  shopifyProductId?: string | null;
  shopifyVariantId?: string | null;
  shipTo?: InvoiceShipTo | null;
};

export type SaveLinesResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Replace a gifting order's line items (with per-line split ship-to) and the
 * order-level default ship-to, recomputing gift totals. Mirrors
 * `updateInvoice`'s line replacement. `shipTo === undefined` leaves the
 * order-level address unchanged; `null` clears it; an object sets it.
 */
export async function saveInfluencerOrderLines(
  id: string,
  input: { lineItems: SaveInfluencerLine[]; shipTo?: InvoiceShipTo | null },
): Promise<SaveLinesResult> {
  const ord = await db.query.influencerOrder.findFirst({
    where: eq(influencerOrder.id, id),
    columns: { id: true, status: true },
  });
  if (!ord) return { ok: false, status: 404, error: "Not found" };
  if (ord.status === "cancelled") {
    return { ok: false, status: 409, error: "Can't edit a cancelled order." };
  }

  const totals = computeGiftTotals(input.lineItems);
  await db
    .update(influencerOrder)
    .set({
      ...(input.shipTo !== undefined ? { shipTo: input.shipTo } : {}),
      updatedAt: new Date(),
      ...totals,
    })
    .where(eq(influencerOrder.id, id));

  await db
    .delete(influencerOrderLineItem)
    .where(eq(influencerOrderLineItem.orderId, id));
  await db.insert(influencerOrderLineItem).values(
    input.lineItems.map((l) => ({
      orderId: id,
      sku: l.sku,
      title: l.title,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      shopifyProductId: l.shopifyProductId ?? null,
      shopifyVariantId: l.shopifyVariantId ?? null,
      shipTo: l.shipTo ?? null,
    })),
  );
  return { ok: true };
}

// ─── Shopify gifting draft order (shared by create + send) ──────────

/**
 * Build the Shopify draft order at 100% off (gifting) for an order's lines.
 * Resolves each line's variant against the catalog for the live Shopify link
 * (unknown variants fall back to a custom line), and applies split-fulfillment
 * "Ship to" attributes + the order-level shipping address the same way the B2B
 * invoice send does. Single source of truth so create + send never diverge.
 * Throws on Shopify failure — callers decide whether to warn or block.
 */
export async function buildGiftDraftOrder(params: {
  email: string | null;
  shopifyCustomerId: string | null;
  influencerName: string;
  lineItems: SaveInfluencerLine[];
  shipTo?: InvoiceShipTo | null;
}): Promise<{ draftOrderId: string; invoiceUrl: string | null }> {
  const catalog = await getCatalogCached();
  const byVariant = new Map(catalog.map((v) => [v.shopifyVariantId, v]));
  const resolved = params.lineItems.map((l) => ({
    sku: l.sku,
    title: l.title,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    shopifyVariantId:
      l.shopifyVariantId && byVariant.has(l.shopifyVariantId)
        ? l.shopifyVariantId
        : null,
    shipTo: l.shipTo ?? null,
  }));
  const { productLines, splitNote } = buildSplitShipping(
    resolved,
    params.shipTo ?? null,
  );
  return getShopifyClient().createDraftOrderInvoice({
    email: params.email,
    shopifyCustomerId: params.shopifyCustomerId,
    shippingAddress: params.shipTo ? shipToToShopify(params.shipTo) : undefined,
    discountPercent: GIFT_DISCOUNT_PERCENT,
    discountTitle: "Influencer gifting",
    // `sample` keeps the $0 order out of revenue/attribution once it syncs back
    // (see order-tags.ts / upsertOrder); `influencer-gift` identifies the flow.
    tags: [...GIFT_ORDER_TAGS],
    note: `Influencer gifting — ${params.influencerName}` + splitNote,
    lines: productLines,
  });
}
