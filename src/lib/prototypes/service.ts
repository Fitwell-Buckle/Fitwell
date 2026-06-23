import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  prototype,
  prototypeAttachment,
  prototypeReference,
  prototypeRound,
} from "@/lib/schema";
import { nextRoundNumber } from "@/lib/prototypes";

export interface PrototypeInput {
  name: string;
  proposedSku?: string | null;
  supplierId?: string | null;
  status?: string;
  description?: string | null;
  estUnitCostCents?: number | null;
  notes?: string | null;
}

export async function createPrototype(input: PrototypeInput) {
  const [created] = await db
    .insert(prototype)
    .values({
      name: input.name,
      proposedSku: input.proposedSku || null,
      supplierId: input.supplierId || null,
      status: input.status || "concept",
      description: input.description || null,
      estUnitCostCents: input.estUnitCostCents ?? null,
      notes: input.notes || null,
    })
    .returning({ id: prototype.id });
  return created;
}

// Partial update. Caller is responsible for any approval-specific fields
// (finalSku, approvedAt) — pass them through `extra`.
export async function updatePrototype(
  id: string,
  input: Partial<PrototypeInput>,
  extra: Partial<{ finalSku: string; approvedAt: Date | null }> = {},
) {
  const [updated] = await db
    .update(prototype)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.proposedSku !== undefined
        ? { proposedSku: input.proposedSku || null }
        : {}),
      ...(input.supplierId !== undefined
        ? { supplierId: input.supplierId || null }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.description !== undefined
        ? { description: input.description || null }
        : {}),
      ...(input.estUnitCostCents !== undefined
        ? { estUnitCostCents: input.estUnitCostCents ?? null }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      ...extra,
      updatedAt: new Date(),
    })
    .where(eq(prototype.id, id))
    .returning({ id: prototype.id });
  return updated ?? null;
}

// Light fetch used by the approval path to read the current finalSku/status
// without pulling the whole detail graph.
export async function getPrototypeRow(id: string) {
  const [row] = await db
    .select({
      id: prototype.id,
      status: prototype.status,
      finalSku: prototype.finalSku,
    })
    .from(prototype)
    .where(eq(prototype.id, id));
  return row ?? null;
}

export async function deletePrototype(id: string) {
  const [deleted] = await db
    .delete(prototype)
    .where(eq(prototype.id, id))
    .returning({ id: prototype.id });
  return deleted ?? null;
}

export interface RoundInput {
  status?: string;
  requestedAt?: string | null;
  expectedAt?: string | null;
  receivedAt?: string | null;
  sampleQty?: number | null;
  unitCostCents?: number | null;
  feedback?: string | null;
}

// Adds the next round to a prototype. Round number is derived server-side from
// existing rounds (max + 1) so concurrent clients can't fight over it.
export async function addRound(prototypeId: string, input: RoundInput) {
  const existing = await db
    .select({ roundNumber: prototypeRound.roundNumber })
    .from(prototypeRound)
    .where(eq(prototypeRound.prototypeId, prototypeId));
  const [created] = await db
    .insert(prototypeRound)
    .values({
      prototypeId,
      roundNumber: nextRoundNumber(existing),
      status: input.status || "requested",
      requestedAt: input.requestedAt || null,
      expectedAt: input.expectedAt || null,
      receivedAt: input.receivedAt || null,
      sampleQty: input.sampleQty ?? null,
      unitCostCents: input.unitCostCents ?? null,
      feedback: input.feedback || null,
    })
    .returning({ id: prototypeRound.id, roundNumber: prototypeRound.roundNumber });
  return created;
}

export async function updateRound(roundId: string, input: RoundInput) {
  const [updated] = await db
    .update(prototypeRound)
    .set({
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.requestedAt !== undefined
        ? { requestedAt: input.requestedAt || null }
        : {}),
      ...(input.expectedAt !== undefined
        ? { expectedAt: input.expectedAt || null }
        : {}),
      ...(input.receivedAt !== undefined
        ? { receivedAt: input.receivedAt || null }
        : {}),
      ...(input.sampleQty !== undefined
        ? { sampleQty: input.sampleQty ?? null }
        : {}),
      ...(input.unitCostCents !== undefined
        ? { unitCostCents: input.unitCostCents ?? null }
        : {}),
      ...(input.feedback !== undefined
        ? { feedback: input.feedback || null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(prototypeRound.id, roundId))
    .returning({ id: prototypeRound.id });
  return updated ?? null;
}

export async function deleteRound(roundId: string) {
  const [deleted] = await db
    .delete(prototypeRound)
    .where(eq(prototypeRound.id, roundId))
    .returning({ id: prototypeRound.id });
  return deleted ?? null;
}

export interface AttachmentInput {
  prototypeId?: string | null;
  roundId?: string | null;
  blobUrl: string;
  filename: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  uploadedByUserId?: string | null;
}

export async function addAttachment(input: AttachmentInput) {
  const [created] = await db
    .insert(prototypeAttachment)
    .values({
      prototypeId: input.prototypeId || null,
      roundId: input.roundId || null,
      blobUrl: input.blobUrl,
      filename: input.filename,
      contentType: input.contentType || null,
      sizeBytes: input.sizeBytes ?? null,
      uploadedByUserId: input.uploadedByUserId || null,
    })
    .returning({ id: prototypeAttachment.id });
  return created;
}

export async function getAttachment(id: string) {
  const [row] = await db
    .select()
    .from(prototypeAttachment)
    .where(eq(prototypeAttachment.id, id));
  return row ?? null;
}

export async function deleteAttachment(id: string) {
  await db.delete(prototypeAttachment).where(eq(prototypeAttachment.id, id));
}

export interface ReferenceInput {
  prototypeId: string;
  url: string;
  embedUrl?: string | null;
  title?: string | null;
}

export async function addReference(input: ReferenceInput) {
  const [created] = await db
    .insert(prototypeReference)
    .values({
      prototypeId: input.prototypeId,
      url: input.url,
      embedUrl: input.embedUrl || null,
      title: input.title || null,
    })
    .returning({ id: prototypeReference.id });
  return created;
}

export async function deleteReference(id: string) {
  const [deleted] = await db
    .delete(prototypeReference)
    .where(eq(prototypeReference.id, id))
    .returning({ id: prototypeReference.id });
  return deleted ?? null;
}

// Full prototype with supplier, rounds (ascending), attachments, and CAD
// reference links — used by the detail page.
export async function getPrototypeDetail(id: string) {
  return db.query.prototype.findFirst({
    where: eq(prototype.id, id),
    with: {
      supplier: { columns: { id: true, name: true } },
      rounds: {
        orderBy: asc(prototypeRound.roundNumber),
        with: { attachments: true },
      },
      attachments: { orderBy: desc(prototypeAttachment.uploadedAt) },
      references: { orderBy: desc(prototypeReference.createdAt) },
    },
  });
}
