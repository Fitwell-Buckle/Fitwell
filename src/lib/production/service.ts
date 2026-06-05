import { z } from "zod";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  productionPo,
  productionPoLineItem,
  productionStageEvent,
  productionComment,
  productionAttachment,
  productionStageAssignment,
  productionSupplierLineCost,
  supplier,
} from "@/lib/schema";
import {
  planAdvance,
  planSetStage,
  nextStage,
  firstStage,
  terminalStage,
  type AdvanceTransition,
  type ProductionStage,
} from "./stages";
import { getStageOrder } from "./stage-labels";
import {
  planSubPos,
  isMultiSupplier,
  subPoStageState,
  subPoTransitions,
  type SubPoTransition,
} from "./sub-po";
import { stagesOwnedBySupplier, supplierForStage } from "./stage-owners";
import { resolveParent } from "./parents";
import { validateStageEventDate, dateToNoonUtc } from "./stage-dates";
import { isHandoff } from "./stage-owners";
import { notifyStageHandoff } from "./notifications";

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
  // PO number is auto-generated server-side (see createPo); not accepted as input.
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
  // PO number is system-assigned and immutable — not editable.
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

/**
 * Insert a PO with its line items and seed an initial stage event per item.
 * The PO number is assigned here from production_po_number_seq (this system
 * owns numbering), zero-padded to ≥5 digits, e.g. "00100".
 */
export async function createPo(
  input: CreatePoInput,
): Promise<{ poId: string; poNumber: string }> {
  const opening = firstStage(await getStageOrder());

  const seq = await db.execute(
    sql`SELECT nextval('production_po_number_seq')::int AS n`,
  );
  const n = Number((seq.rows[0] as { n: number }).n);
  const poNumber = String(n).padStart(5, "0");

  const [po] = await db
    .insert(productionPo)
    .values({
      supplierId: input.supplierId,
      shopifyPoNumber: poNumber,
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
        currentStage: opening,
      })),
    )
    .returning({ id: productionPoLineItem.id });

  // Seed the opening stage event so the timeline and future cycle-time math
  // have a starting point.
  await db.insert(productionStageEvent).values(
    insertedItems.map((item) => ({
      lineItemId: item.id,
      stage: opening,
    })),
  );

  return { poId: po.id, poNumber };
}

/**
 * Create a PO split across multiple suppliers. Creates the master (line items +
 * opening events; its supplier_id is the primary/fallback supplier), persists
 * the stage→supplier map, then generates one sub-PO per distinct supplier
 * (parent_po_id = master, po_suffix "A"/"B"…). Sub-POs carry no line items of
 * their own — they render the master's items + the stages that supplier owns.
 * If the assignments don't actually split across >1 supplier, no sub-POs are
 * created and it behaves like a normal PO.
 */
export async function createMultiSupplierPo(
  input: CreatePoInput,
  stageSuppliers: { stage: ProductionStage; supplierId: string }[],
): Promise<{
  poId: string;
  poNumber: string;
  subPos: { id: string; suffix: string; supplierId: string }[];
}> {
  const master = await createPo(input);
  await setStageAssignments(master.poId, stageSuppliers);

  const order = await getStageOrder();
  const workStages = order.slice(0, -1);
  const plan = planSubPos(order, workStages, stageSuppliers, input.supplierId);
  if (!isMultiSupplier(plan)) {
    return { poId: master.poId, poNumber: master.poNumber, subPos: [] };
  }

  const subPos: { id: string; suffix: string; supplierId: string }[] = [];
  for (const p of plan) {
    const [sub] = await db
      .insert(productionPo)
      .values({
        parentPoId: master.poId,
        poSuffix: p.suffix,
        supplierId: p.supplierId,
        shopifyPoNumber: master.poNumber,
        issuedDate: input.issuedDate,
        expectedDeliveryDate: input.expectedDeliveryDate ?? null,
        companyId: input.companyId ?? null,
        shopifyLocationId: input.shopifyLocationId ?? null,
        locationName: input.locationName ?? null,
        status: "active",
      })
      .returning({ id: productionPo.id });
    subPos.push({ id: sub.id, suffix: p.suffix, supplierId: p.supplierId });
  }
  return { poId: master.poId, poNumber: master.poNumber, subPos };
}

/**
 * Reconcile a master's sub-POs to its current stage→supplier assignments
 * (called on edit). Sub-POs are lightweight send documents with no line items
 * of their own, so this rebuilds them from scratch: delete the master's existing
 * sub-POs, then recreate one per distinct supplier. When `multiSupplier` is
 * false (or the split collapses to one supplier), the master is left with no
 * sub-POs (reverts to a standalone PO).
 */
export async function syncMasterSubPos(
  masterId: string,
  multiSupplier: boolean,
): Promise<void> {
  const master = await db.query.productionPo.findFirst({
    where: eq(productionPo.id, masterId),
    columns: {
      id: true,
      supplierId: true,
      shopifyPoNumber: true,
      issuedDate: true,
      expectedDeliveryDate: true,
      companyId: true,
      shopifyLocationId: true,
      locationName: true,
    },
    with: { stageAssignments: { columns: { stage: true, supplierId: true } } },
  });
  if (!master) return;

  // Preserve each supplier's own ETA across regeneration — like line costs,
  // which are keyed by supplier so they survive the delete+recreate. Snapshot
  // supplier→ETA before deleting; a brand-new supplier seeds from the master.
  const priorSubs = await db.query.productionPo.findMany({
    where: eq(productionPo.parentPoId, masterId),
    columns: { supplierId: true, expectedDeliveryDate: true },
  });
  const priorEta = new Map(
    priorSubs.map((s) => [s.supplierId, s.expectedDeliveryDate]),
  );

  await db.delete(productionPo).where(eq(productionPo.parentPoId, masterId));
  if (!multiSupplier) return;

  const order = await getStageOrder();
  const workStages = order.slice(0, -1);
  const plan = planSubPos(order, workStages, master.stageAssignments, master.supplierId);
  if (!isMultiSupplier(plan)) return;

  for (const p of plan) {
    await db.insert(productionPo).values({
      parentPoId: masterId,
      poSuffix: p.suffix,
      supplierId: p.supplierId,
      shopifyPoNumber: master.shopifyPoNumber,
      issuedDate: master.issuedDate,
      expectedDeliveryDate:
        priorEta.get(p.supplierId) ?? master.expectedDeliveryDate ?? null,
      companyId: master.companyId ?? null,
      shopifyLocationId: master.shopifyLocationId ?? null,
      locationName: master.locationName ?? null,
      status: "active",
    });
  }
}

/** Sub-POs of a master, lettered order, with supplier names. */
export async function getSubPos(masterId: string) {
  return db.query.productionPo.findMany({
    where: eq(productionPo.parentPoId, masterId),
    columns: {
      id: true,
      poSuffix: true,
      supplierId: true,
      shopifyPoNumber: true,
      status: true,
      shopifyReceivedAt: true,
      expectedDeliveryDate: true,
      sentAt: true,
      sentVia: true,
    },
    with: { supplier: { columns: { name: true } } },
    orderBy: asc(productionPo.poSuffix),
  });
}

/**
 * Set a sub-PO's own ETA (expected_delivery_date). Each supplier's sub-PO has an
 * independent ETA; the master's is locked/derived when split (see rollupEta).
 * The route verifies this PO is a sub-PO first, mirroring the line-costs route.
 */
export async function setSubPoEta(
  subPoId: string,
  expectedDeliveryDate: string | null,
): Promise<void> {
  await db
    .update(productionPo)
    .set({ expectedDeliveryDate, updatedAt: new Date() })
    .where(eq(productionPo.id, subPoId));
}

/**
 * Mark a PO (or sub-PO) sent to its supplier, or clear it. Emailing a PO stamps
 * `sent` via "email"; the "Mark as sent" button uses "manual" (WhatsApp / phone
 * / in person). Per-row, so each sub-PO tracks its own send.
 */
export async function setPoSent(
  poId: string,
  sent: boolean,
  via: "email" | "manual" = "manual",
): Promise<void> {
  await db
    .update(productionPo)
    .set(
      sent
        ? { sentAt: new Date(), sentVia: via, updatedAt: new Date() }
        : { sentAt: null, sentVia: null, updatedAt: new Date() },
    )
    .where(eq(productionPo.id, poId));
}

/**
 * Per-supplier, per-line-item production costs for a master PO. Keyed by
 * (master, supplier, line) so they survive sub-PO regeneration on edit. The
 * master rolls these up: sum of suppliers' unit costs per line × qty.
 */
export async function getSupplierLineCosts(
  masterPoId: string,
): Promise<{ supplierId: string; lineItemId: string; unitCostCents: number | null }[]> {
  return db
    .select({
      supplierId: productionSupplierLineCost.supplierId,
      lineItemId: productionSupplierLineCost.lineItemId,
      unitCostCents: productionSupplierLineCost.unitCostCents,
    })
    .from(productionSupplierLineCost)
    .where(eq(productionSupplierLineCost.poId, masterPoId));
}

/**
 * Upsert a supplier's per-line unit costs on a master PO. A null cost clears the
 * entry's amount (kept as a row so re-entry is simple). For a raw-blank supplier
 * the caller expands one group price into a row per covered line item, each
 * carrying the same per-piece cost.
 */
export async function setSupplierLineCosts(
  masterPoId: string,
  supplierId: string,
  costs: { lineItemId: string; unitCostCents: number | null }[],
): Promise<void> {
  const now = new Date();
  for (const c of costs) {
    await db
      .insert(productionSupplierLineCost)
      .values({
        poId: masterPoId,
        supplierId,
        lineItemId: c.lineItemId,
        unitCostCents: c.unitCostCents,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          productionSupplierLineCost.poId,
          productionSupplierLineCost.supplierId,
          productionSupplierLineCost.lineItemId,
        ],
        set: { unitCostCents: c.unitCostCents, updatedAt: now },
      });
  }
}

/**
 * Advance a sub-PO. The shared line items live on the master, but each supplier
 * only drives them through the stages it owns:
 *  - "step":     move every line still inside the supplier's stages forward one
 *                (an intermediate Stamping → EDM). Only valid while "advance".
 *  - "complete": hand every owned-stage line off to the next supplier's first
 *                stage (or "complete" if last). Only valid once "complete"-ready
 *                — every owned-stage line parked at the supplier's last stage.
 * Mirrors advance()'s event bookkeeping and notifies admins on handoff.
 */
export async function advanceSubPo(params: {
  subPoId: string;
  mode: "step" | "complete";
  userId?: string;
}): Promise<SubPoTransition[]> {
  const sub = await db.query.productionPo.findFirst({
    where: eq(productionPo.id, params.subPoId),
    columns: { id: true, parentPoId: true, supplierId: true },
  });
  if (!sub) throw new Error(`production PO ${params.subPoId} not found`);
  if (!sub.parentPoId) throw new Error("not a sub-PO");

  const master = await db.query.productionPo.findFirst({
    where: eq(productionPo.id, sub.parentPoId),
    columns: { id: true, supplierId: true },
    with: {
      lineItems: { columns: { id: true, currentStage: true } },
      stageAssignments: { columns: { stage: true, supplierId: true } },
    },
  });
  if (!master) throw new Error("master PO not found");

  const order = await getStageOrder();
  const terminal = terminalStage(order);
  const owned = stagesOwnedBySupplier(
    order,
    master.stageAssignments,
    master.supplierId,
    sub.supplierId,
  );
  const state = subPoStageState(
    order,
    owned,
    master.lineItems.map((li) => li.currentStage),
  );
  if (params.mode === "complete" && state.status !== "complete") {
    throw new Error("sub-PO is not ready to complete");
  }
  if (params.mode === "step" && state.status !== "advance") {
    throw new Error("nothing to advance");
  }

  const transitions = subPoTransitions({
    order,
    ownedStages: owned,
    lines: master.lineItems,
    mode: params.mode,
  });

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  for (const t of transitions) {
    await db
      .update(productionPoLineItem)
      .set({
        currentStage: t.to,
        updatedAt: now,
        actualCompletionDate: t.to === terminal ? today : undefined,
      })
      .where(eq(productionPoLineItem.id, t.lineItemId));

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

  // Completing a sub-PO hands the items to the next supplier — let the admins know.
  if (params.mode === "complete") {
    for (const t of transitions) {
      await notifySupplierHandoff({
        lineItemId: t.lineItemId,
        supplierId: sub.supplierId,
        transitions,
      });
    }
  }

  return transitions;
}

/** The stages a sub-PO can move its line items to: the supplier's own stages
 *  (forward or back) plus each run-boundary handoff (the next stage after an
 *  owned stage the supplier doesn't own — i.e. the next team). */
export function subPoStageTargets(
  order: readonly string[],
  ownedStages: ProductionStage[],
): ProductionStage[] {
  const ownedSet = new Set(ownedStages);
  const targets = new Set<ProductionStage>(ownedStages);
  for (const s of ownedStages) {
    const n = nextStage(order, s);
    if (n != null && !ownedSet.has(n)) targets.add(n);
  }
  return order.filter((s) => targets.has(s));
}

/**
 * Set a sub-PO's stage directly (drives the master's line items currently in
 * this supplier's stages to `toStage`). Allows forward, backward, and handoff
 * moves — whatever's in `subPoStageTargets`. Auto-save target for the stage
 * dropdown; replaces the step/complete advance buttons.
 */
export async function setSubPoStage(params: {
  subPoId: string;
  toStage: ProductionStage;
  userId?: string;
}): Promise<SubPoTransition[]> {
  const sub = await db.query.productionPo.findFirst({
    where: eq(productionPo.id, params.subPoId),
    columns: { id: true, parentPoId: true, supplierId: true },
  });
  if (!sub) throw new Error(`production PO ${params.subPoId} not found`);
  if (!sub.parentPoId) throw new Error("not a sub-PO");

  const master = await db.query.productionPo.findFirst({
    where: eq(productionPo.id, sub.parentPoId),
    columns: { id: true, supplierId: true },
    with: {
      lineItems: { columns: { id: true, currentStage: true } },
      stageAssignments: { columns: { stage: true, supplierId: true } },
    },
  });
  if (!master) throw new Error("master PO not found");

  const order = await getStageOrder();
  const terminal = terminalStage(order);
  const owned = stagesOwnedBySupplier(
    order,
    master.stageAssignments,
    master.supplierId,
    sub.supplierId,
  );
  const ownedSet = new Set(owned);
  if (!subPoStageTargets(order, owned).includes(params.toStage)) {
    throw new Error("stage not available for this sub-PO");
  }

  // Move the lines currently in this supplier's hands (not upstream / done).
  const transitions: SubPoTransition[] = master.lineItems
    .filter((li) => ownedSet.has(li.currentStage) && li.currentStage !== params.toStage)
    .map((li) => ({ lineItemId: li.id, from: li.currentStage, to: params.toStage }));

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  for (const t of transitions) {
    await db
      .update(productionPoLineItem)
      .set({
        currentStage: t.to,
        updatedAt: now,
        actualCompletionDate: t.to === terminal ? today : null,
      })
      .where(eq(productionPoLineItem.id, t.lineItemId));

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

  // Moving out of owned stages is a handoff — notify the admins.
  if (!ownedSet.has(params.toStage)) {
    for (const t of transitions) {
      await notifySupplierHandoff({
        lineItemId: t.lineItemId,
        supplierId: sub.supplierId,
        transitions,
      });
    }
  }

  return transitions;
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

  const opening = firstStage(await getStageOrder());
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
          currentStage: opening,
        })
        .returning({ id: productionPoLineItem.id });
      await db
        .insert(productionStageEvent)
        .values({ lineItemId: ins.id, stage: opening });
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

  const order = await getStageOrder();
  const terminal = terminalStage(order);
  const transitions = planAdvance({
    order,
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
        actualCompletionDate: t.to === terminal ? today : undefined,
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

  const terminal = terminalStage(await getStageOrder());
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
        actualCompletionDate: t.to === terminal ? today : null,
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
        columns: { id: true, name: true, contactName: true, contactEmail: true },
        with: {
          priceTier: { columns: { name: true, discountPercent: true } },
          customer: { columns: { email: true, shopifyId: true } },
        },
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
        with: { author: { columns: { name: true, email: true, role: true } } },
      },
      attachments: {
        orderBy: desc(productionAttachment.uploadedAt),
        with: { uploadedBy: { columns: { name: true, email: true, role: true } } },
      },
      stageAssignments: {
        columns: { stage: true, supplierId: true },
        with: { supplier: { columns: { name: true } } },
      },
    },
  });
}

/**
 * Replace all stage→supplier assignments for a PO (admin editor). Only stages
 * with a supplier are stored; unassigned stages fall back to the PO's primary
 * supplier at read time (see stage-owners.ts).
 */
export async function setStageAssignments(
  poId: string,
  assignments: { stage: ProductionStage; supplierId: string }[],
): Promise<void> {
  await db
    .delete(productionStageAssignment)
    .where(eq(productionStageAssignment.poId, poId));
  const rows = assignments.filter((a) => a.supplierId);
  if (rows.length > 0) {
    await db
      .insert(productionStageAssignment)
      .values(rows.map((a) => ({ poId, stage: a.stage, supplierId: a.supplierId })));
  }
}

export async function getStageAssignments(
  poId: string,
): Promise<{ stage: ProductionStage; supplierId: string }[]> {
  return db.query.productionStageAssignment.findMany({
    where: eq(productionStageAssignment.poId, poId),
    columns: { stage: true, supplierId: true },
  });
}

/**
 * After a supplier moves a line item, notify the admins if it left the stages
 * that supplier owns (a handoff). Best-effort; never throws into the request.
 */
export async function notifySupplierHandoff(params: {
  lineItemId: string;
  supplierId: string;
  transitions: AdvanceTransition[];
}): Promise<void> {
  try {
    const t = params.transitions.find((x) => x.lineItemId === params.lineItemId);
    if (!t) return;
    const li = await db.query.productionPoLineItem.findFirst({
      where: eq(productionPoLineItem.id, params.lineItemId),
      columns: { sku: true, poId: true },
    });
    if (!li) return;
    const po = await db.query.productionPo.findFirst({
      where: eq(productionPo.id, li.poId),
      columns: { shopifyPoNumber: true, supplierId: true },
      with: { stageAssignments: { columns: { stage: true, supplierId: true } } },
    });
    if (!po) return;
    const order = await getStageOrder();
    const terminal = terminalStage(order);
    if (!isHandoff(order, po.stageAssignments, po.supplierId, params.supplierId, t.from, t.to)) {
      return;
    }
    const sup = await db.query.supplier.findFirst({
      where: eq(supplier.id, params.supplierId),
      columns: { name: true },
    });

    // The sub-PO the handing-off supplier owns (e.g. 00118-A), so the alert shows
    // the actual sub-PO rather than the bare master number.
    const workStages = order.slice(0, -1);
    const plan = planSubPos(order, workStages, po.stageAssignments, po.supplierId);
    const poSuffix = isMultiSupplier(plan)
      ? plan.find((p) => p.supplierId === params.supplierId)?.suffix ?? null
      : null;

    // Who picks the work up next — the supplier owning the stage it moved into,
    // or "Complete" when it's the final handoff.
    let nextSupplierName = "Complete";
    if (t.to !== terminal) {
      const nextId = supplierForStage(order, po.stageAssignments, po.supplierId, t.to);
      const next = nextId
        ? await db.query.supplier.findFirst({
            where: eq(supplier.id, nextId),
            columns: { name: true },
          })
        : null;
      nextSupplierName = next?.name ?? "the next supplier";
    }

    await notifyStageHandoff({
      poId: li.poId,
      poNumber: po.shopifyPoNumber,
      poSuffix,
      lineItemId: params.lineItemId,
      sku: li.sku,
      supplierId: params.supplierId,
      supplierName: sup?.name ?? "A supplier",
      nextSupplierName,
    });
  } catch (err) {
    console.error("notifySupplierHandoff failed:", err);
  }
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

export type UpdateStageDateResult =
  | { ok: true; enteredAt: string }
  | { ok: false; status: number; error: string };

/**
 * Edit a stage event's transition date (day-granularity, anchored to noon UTC).
 * Sets the event's entered_at and syncs the previous event's exited_at to the
 * same moment — they're the same transition — so the Gantt and cycle-time stay
 * consistent. Validates the new date stays between its timeline neighbours.
 */
export async function updateStageEventDate(
  eventId: string,
  enteredDate: string,
): Promise<UpdateStageDateResult> {
  const target = await db.query.productionStageEvent.findFirst({
    where: eq(productionStageEvent.id, eventId),
    columns: { id: true, lineItemId: true },
  });
  if (!target) return { ok: false, status: 404, error: "Not found" };

  // The line item's timeline as displayed; neighbours bound the edit.
  const chain = await db
    .select({ id: productionStageEvent.id, enteredAt: productionStageEvent.enteredAt })
    .from(productionStageEvent)
    .where(eq(productionStageEvent.lineItemId, target.lineItemId))
    .orderBy(asc(productionStageEvent.enteredAt));

  const idx = chain.findIndex((e) => e.id === eventId);
  const prev = idx > 0 ? chain[idx - 1] : null;
  const next = idx < chain.length - 1 ? chain[idx + 1] : null;

  const newEntered = dateToNoonUtc(enteredDate);
  const check = validateStageEventDate({
    newEnteredMs: newEntered.getTime(),
    prevEnteredMs: prev ? prev.enteredAt.getTime() : null,
    nextEnteredMs: next ? next.enteredAt.getTime() : null,
  });
  if (!check.ok) return { ok: false, status: 400, error: check.error };

  // neon-http has no multi-statement transaction; two sequential updates.
  await db
    .update(productionStageEvent)
    .set({ enteredAt: newEntered })
    .where(eq(productionStageEvent.id, eventId));
  if (prev) {
    await db
      .update(productionStageEvent)
      .set({ exitedAt: newEntered })
      .where(eq(productionStageEvent.id, prev.id));
  }

  return { ok: true, enteredAt: newEntered.toISOString() };
}

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
