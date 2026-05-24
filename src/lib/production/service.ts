import { z } from "zod";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  productionPo,
  productionPoLineItem,
  productionStageEvent,
  productionComment,
  productionAttachment,
} from "@/lib/schema";
import {
  planAdvance,
  planSetStage,
  type AdvanceTransition,
  type ProductionStage,
} from "./stages";
import { resolveParent } from "./parents";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date");

// Company (our own) + warehouse (Shopify location id + name) tags. Used at the
// PO header (defaults) and overridable per line item.
const refFields = {
  companyId: z.string().max(300).nullish(),
  shopifyLocationId: z.string().max(300).nullish(),
  locationName: z.string().max(300).nullish(),
};

export const lineItemInputSchema = z.object({
  sku: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  quantity: z.number().int().positive(),
  unitCostCents: z.number().int().nonnegative().nullish(),
  shopifyProductId: z.string().max(200).nullish(),
  shopifyVariantId: z.string().max(200).nullish(),
  expectedCompletionDate: dateString.nullish(),
  customerId: z.string().max(200).nullish(),
  orderLineItemId: z.string().max(200).nullish(),
  // Optional per-line overrides of the PO-level company / warehouse.
  ...refFields,
});

export const createPoSchema = z.object({
  supplierId: z.string().min(1),
  shopifyPoNumber: z.string().min(1).max(200),
  issuedDate: dateString,
  expectedDeliveryDate: dateString.nullish(),
  lockStagesTogether: z.boolean().optional(),
  notes: z.string().max(5000).nullish(),
  ...refFields,
  lineItems: z.array(lineItemInputSchema).min(1, "a PO needs at least one line item"),
});

export type CreatePoInput = z.infer<typeof createPoSchema>;

export const updatePoSchema = z
  .object({
    status: z.enum(["active", "on_hold", "complete", "cancelled"]),
    lockStagesTogether: z.boolean(),
    shopifyPoNumber: z.string().min(1).max(200),
    issuedDate: dateString,
    expectedDeliveryDate: dateString.nullable(),
    notes: z.string().max(5000).nullable(),
  })
  .partial();

export type UpdatePoInput = z.infer<typeof updatePoSchema>;

// Full edit: a line item with an `id` is existing (update); without, it's new.
export const editLineItemSchema = lineItemInputSchema.extend({
  id: z.string().optional(),
});

export const updatePoFullSchema = z.object({
  supplierId: z.string().min(1),
  shopifyPoNumber: z.string().min(1).max(200),
  issuedDate: dateString,
  expectedDeliveryDate: dateString.nullable(),
  notes: z.string().max(5000).nullable(),
  ...refFields,
  lineItems: z.array(editLineItemSchema).min(1, "a PO needs at least one line item"),
});

export type UpdatePoFullInput = z.infer<typeof updatePoFullSchema>;

export const advanceSchema = z.object({
  lineItemId: z.string().min(1).optional(),
});

/** Insert a PO with its line items and seed an initial stage event per item. */
export async function createPo(input: CreatePoInput): Promise<{ poId: string }> {
  const [po] = await db
    .insert(productionPo)
    .values({
      supplierId: input.supplierId,
      shopifyPoNumber: input.shopifyPoNumber,
      issuedDate: input.issuedDate,
      expectedDeliveryDate: input.expectedDeliveryDate ?? null,
      lockStagesTogether: input.lockStagesTogether ?? true,
      notes: input.notes ?? null,
      companyId: input.companyId ?? null,
      shopifyLocationId: input.shopifyLocationId ?? null,
      locationName: input.locationName ?? null,
    })
    .returning({ id: productionPo.id });

  const insertedItems = await db
    .insert(productionPoLineItem)
    .values(
      input.lineItems.map((li) => ({
        poId: po.id,
        sku: li.sku,
        title: li.title,
        quantity: li.quantity,
        unitCostCents: li.unitCostCents ?? null,
        shopifyProductId: li.shopifyProductId ?? null,
        shopifyVariantId: li.shopifyVariantId ?? null,
        expectedCompletionDate: li.expectedCompletionDate ?? null,
        customerId: li.customerId ?? null,
        orderLineItemId: li.orderLineItemId ?? null,
        companyId: li.companyId ?? null,
        shopifyLocationId: li.shopifyLocationId ?? null,
        locationName: li.locationName ?? null,
      })),
    )
    .returning({ id: productionPoLineItem.id });

  // Seed the opening "supplier_po" stage event so the timeline and future
  // cycle-time math have a starting point.
  await db.insert(productionStageEvent).values(
    insertedItems.map((item) => ({
      lineItemId: item.id,
      stage: "supplier_po" as const,
    })),
  );

  return { poId: po.id };
}

/**
 * Full edit of a PO: updates header fields and reconciles line items —
 * existing lines (with id) are updated in place (keeping their stage + history),
 * new lines are inserted with an opening stage event, and any existing line not
 * in the submission is deleted (cascading its stage events/comments/attachments).
 * Changing a line's product just rewrites its sku/title/IDs; its stage is kept.
 */
export async function updatePoFull(
  poId: string,
  input: UpdatePoFullInput,
): Promise<{ poId: string }> {
  await db
    .update(productionPo)
    .set({
      supplierId: input.supplierId,
      shopifyPoNumber: input.shopifyPoNumber,
      issuedDate: input.issuedDate,
      expectedDeliveryDate: input.expectedDeliveryDate ?? null,
      notes: input.notes ?? null,
      companyId: input.companyId ?? null,
      shopifyLocationId: input.shopifyLocationId ?? null,
      locationName: input.locationName ?? null,
      updatedAt: new Date(),
    })
    .where(eq(productionPo.id, poId));

  const existing = await db
    .select({ id: productionPoLineItem.id })
    .from(productionPoLineItem)
    .where(eq(productionPoLineItem.poId, poId));
  const existingIds = new Set(existing.map((e) => e.id));
  const submittedIds = new Set(
    input.lineItems.map((li) => li.id).filter((id): id is string => !!id),
  );

  // Delete removed lines (cascade clears their events/comments/attachments).
  for (const e of existing) {
    if (!submittedIds.has(e.id)) {
      await db
        .delete(productionPoLineItem)
        .where(eq(productionPoLineItem.id, e.id));
    }
  }

  const now = new Date();
  for (const li of input.lineItems) {
    if (li.id && existingIds.has(li.id)) {
      await db
        .update(productionPoLineItem)
        .set({
          sku: li.sku,
          title: li.title,
          quantity: li.quantity,
          unitCostCents: li.unitCostCents ?? null,
          shopifyProductId: li.shopifyProductId ?? null,
          shopifyVariantId: li.shopifyVariantId ?? null,
          companyId: li.companyId ?? null,
          shopifyLocationId: li.shopifyLocationId ?? null,
          locationName: li.locationName ?? null,
          updatedAt: now,
        })
        .where(eq(productionPoLineItem.id, li.id));
    } else {
      const [ins] = await db
        .insert(productionPoLineItem)
        .values({
          poId,
          sku: li.sku,
          title: li.title,
          quantity: li.quantity,
          unitCostCents: li.unitCostCents ?? null,
          shopifyProductId: li.shopifyProductId ?? null,
          shopifyVariantId: li.shopifyVariantId ?? null,
          companyId: li.companyId ?? null,
          shopifyLocationId: li.shopifyLocationId ?? null,
          locationName: li.locationName ?? null,
        })
        .returning({ id: productionPoLineItem.id });
      await db
        .insert(productionStageEvent)
        .values({ lineItemId: ins.id, stage: "supplier_po" as const });
    }
  }

  return { poId };
}

/**
 * Advance a PO's stage(s). Respects lockStagesTogether: locked POs move every
 * non-complete line item together; broken POs move only the targeted item.
 * Closes the open stage event, opens the next, and stamps the completion date
 * when an item reaches "complete". Returns the applied transitions.
 *
 * Note: neon-http has no multi-statement transactions, so writes are applied
 * sequentially. Stage advance is idempotent-safe because each transition reads
 * the item's current stage at plan time.
 */
export async function advance(params: {
  poId: string;
  lineItemId?: string;
  userId?: string;
}): Promise<AdvanceTransition[]> {
  const po = await db.query.productionPo.findFirst({
    where: eq(productionPo.id, params.poId),
    with: {
      lineItems: { columns: { id: true, currentStage: true } },
    },
  });
  if (!po) throw new Error(`production PO ${params.poId} not found`);

  const transitions = planAdvance({
    lockStagesTogether: po.lockStagesTogether,
    lineItems: po.lineItems,
    lineItemId: params.lineItemId,
  });

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  for (const t of transitions) {
    await db
      .update(productionPoLineItem)
      .set({
        currentStage: t.to,
        updatedAt: now,
        actualCompletionDate: t.to === "complete" ? today : undefined,
      })
      .where(eq(productionPoLineItem.id, t.lineItemId));

    // Close the still-open event for the stage we're leaving.
    await db
      .update(productionStageEvent)
      .set({ exitedAt: now })
      .where(
        and(
          eq(productionStageEvent.lineItemId, t.lineItemId),
          eq(productionStageEvent.stage, t.from),
          isNull(productionStageEvent.exitedAt),
        ),
      );

    await db.insert(productionStageEvent).values({
      lineItemId: t.lineItemId,
      stage: t.to,
      enteredAt: now,
      triggeredByUserId: params.userId ?? null,
    });
  }

  return transitions;
}

/**
 * Move a line item directly to a target stage (kanban drag). Allows forward or
 * backward jumps. A locked PO moves all its items; a broken PO moves only the
 * dragged item. Clears actualCompletionDate when moving away from "complete".
 */
export async function setStage(params: {
  lineItemId: string;
  toStage: ProductionStage;
  userId?: string;
}): Promise<AdvanceTransition[]> {
  const li = await db.query.productionPoLineItem.findFirst({
    where: eq(productionPoLineItem.id, params.lineItemId),
    columns: { id: true, poId: true },
  });
  if (!li) throw new Error(`line item ${params.lineItemId} not found`);

  const po = await db.query.productionPo.findFirst({
    where: eq(productionPo.id, li.poId),
    with: { lineItems: { columns: { id: true, currentStage: true } } },
  });
  if (!po) throw new Error(`production PO ${li.poId} not found`);

  const transitions = planSetStage({
    lockStagesTogether: po.lockStagesTogether,
    lineItems: po.lineItems,
    lineItemId: params.lineItemId,
    toStage: params.toStage,
  });

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  for (const t of transitions) {
    await db
      .update(productionPoLineItem)
      .set({
        currentStage: t.to,
        updatedAt: now,
        actualCompletionDate: t.to === "complete" ? today : null,
      })
      .where(eq(productionPoLineItem.id, t.lineItemId));

    // One open event per item, so close whichever is open (handles jumps).
    await db
      .update(productionStageEvent)
      .set({ exitedAt: now })
      .where(
        and(
          eq(productionStageEvent.lineItemId, t.lineItemId),
          isNull(productionStageEvent.exitedAt),
        ),
      );

    await db.insert(productionStageEvent).values({
      lineItemId: t.lineItemId,
      stage: t.to,
      enteredAt: now,
      triggeredByUserId: params.userId ?? null,
    });
  }

  return transitions;
}

/** PO with supplier, line items (+ customer), stage events, and comments. */
export async function getPoDetail(poId: string) {
  return db.query.productionPo.findFirst({
    where: eq(productionPo.id, poId),
    with: {
      supplier: true,
      company: {
        columns: { id: true, name: true },
        with: { priceTier: { columns: { name: true, discountPercent: true } } },
      },
      lineItems: {
        with: {
          customer: { columns: { id: true, firstName: true, lastName: true } },
          company: { columns: { id: true, name: true } },
          stageEvents: { orderBy: asc(productionStageEvent.enteredAt) },
        },
      },
      comments: {
        orderBy: asc(productionComment.createdAt),
        with: { author: { columns: { name: true, email: true } } },
      },
      attachments: { orderBy: desc(productionAttachment.uploadedAt) },
    },
  });
}

/** Record an uploaded attachment (blob already stored). Exactly one parent. */
export async function addAttachment(params: {
  poId?: string | null;
  lineItemId?: string | null;
  blobUrl: string;
  filename: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  uploadedByUserId?: string | null;
}): Promise<{ id: string }> {
  const parent = resolveParent(params);
  if (!parent.ok) throw new Error(parent.error);

  const [row] = await db
    .insert(productionAttachment)
    .values({
      poId: parent.poId,
      lineItemId: parent.lineItemId,
      blobUrl: params.blobUrl,
      filename: params.filename,
      contentType: params.contentType ?? null,
      sizeBytes: params.sizeBytes ?? null,
      uploadedByUserId: params.uploadedByUserId ?? null,
    })
    .returning({ id: productionAttachment.id });
  return row;
}

export const commentSchema = z.object({
  body: z.string().min(1).max(5000),
});

/** Add a comment to a PO or a line item (exactly one parent). */
export async function addComment(params: {
  poId?: string | null;
  lineItemId?: string | null;
  authorUserId: string;
  body: string;
}): Promise<{ id: string }> {
  const parent = resolveParent(params);
  if (!parent.ok) throw new Error(parent.error);

  const [row] = await db
    .insert(productionComment)
    .values({
      poId: parent.poId,
      lineItemId: parent.lineItemId,
      authorUserId: params.authorUserId,
      body: params.body,
    })
    .returning({ id: productionComment.id });
  return row;
}
