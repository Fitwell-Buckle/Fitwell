import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  prototype,
  prototypeAttachment,
  prototypeReference,
  prototypeRound,
  prototypeSupplier,
} from "@/lib/schema";
import { mergeCandidateVendorIds, nextRoundNumber } from "@/lib/prototypes";

export interface PrototypeInput {
  name: string;
  proposedSku?: string | null;
  // The single AWARDED vendor (chosen from the candidate set). Usually set later
  // on the detail page, not at creation.
  supplierId?: string | null;
  // The candidate vendor set we'll request quotes from (many-to-many).
  supplierIds?: string[];
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

  // Attach the candidate vendors (RFQ recipients). The awarded vendor, if any,
  // is also a candidate by definition, so fold it in.
  const ids = mergeCandidateVendorIds(input.supplierIds, input.supplierId);
  if (ids.length > 0) {
    await db
      .insert(prototypeSupplier)
      .values(ids.map((supplierId) => ({ prototypeId: created.id, supplierId })))
      .onConflictDoNothing();
  }
  return created;
}

// Add a candidate vendor to a prototype (idempotent on the (prototype, vendor)
// pair). The RFQ flow will send this vendor a quote request.
export async function addPrototypeSupplier(
  prototypeId: string,
  supplierId: string,
) {
  await db
    .insert(prototypeSupplier)
    .values({ prototypeId, supplierId })
    .onConflictDoNothing();
}

// Remove a candidate vendor. If it was also the awarded vendor, clear the award
// so we never point `supplierId` at a vendor no longer in the running.
export async function removePrototypeSupplier(
  prototypeId: string,
  supplierId: string,
) {
  await db
    .delete(prototypeSupplier)
    .where(
      and(
        eq(prototypeSupplier.prototypeId, prototypeId),
        eq(prototypeSupplier.supplierId, supplierId),
      ),
    );
  await db
    .update(prototype)
    .set({ supplierId: null, updatedAt: new Date() })
    .where(
      and(eq(prototype.id, prototypeId), eq(prototype.supplierId, supplierId)),
    );
}

// Stamp that we emailed this vendor a request for quote (via the PO email
// system). Idempotent — re-sending updates the timestamp.
export async function markRfqSent(prototypeId: string, supplierId: string) {
  await db
    .update(prototypeSupplier)
    .set({ rfqSentAt: new Date() })
    .where(
      and(
        eq(prototypeSupplier.prototypeId, prototypeId),
        eq(prototypeSupplier.supplierId, supplierId),
      ),
    );
}

export interface QuoteInput {
  unitCostCents?: number | null;
  leadTimeDays?: number | null;
  moq?: number | null;
  setupCostCents?: number | null;
  notes?: string | null;
}

// Record (or update) the quote a vendor gave for a prototype. Works whether or
// not the RFQ went through the system. Stamps `quoteReceivedAt` so the vendor
// reads as "quoted"; clearing it (all fields null) is allowed for corrections.
export async function recordPrototypeQuote(
  prototypeId: string,
  supplierId: string,
  quote: QuoteInput,
) {
  const [updated] = await db
    .update(prototypeSupplier)
    .set({
      quoteUnitCostCents: quote.unitCostCents ?? null,
      quoteLeadTimeDays: quote.leadTimeDays ?? null,
      quoteMoq: quote.moq ?? null,
      quoteSetupCostCents: quote.setupCostCents ?? null,
      quoteNotes: quote.notes || null,
      quoteReceivedAt: new Date(),
    })
    .where(
      and(
        eq(prototypeSupplier.prototypeId, prototypeId),
        eq(prototypeSupplier.supplierId, supplierId),
      ),
    )
    .returning({ id: prototypeSupplier.id });
  return updated ?? null;
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

  // Awarding a vendor implies it's in the running — keep award ⊆ candidates.
  if (updated && input.supplierId) {
    await addPrototypeSupplier(id, input.supplierId);
  }
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

// Full prototype with the awarded supplier, the candidate vendor set, rounds
// (ascending), attachments, and CAD reference links — used by the detail page.
export async function getPrototypeDetail(id: string) {
  return db.query.prototype.findFirst({
    where: eq(prototype.id, id),
    with: {
      supplier: { columns: { id: true, name: true } },
      candidateVendors: {
        with: {
          supplier: { columns: { id: true, name: true, contactEmail: true } },
        },
      },
      rounds: {
        orderBy: asc(prototypeRound.roundNumber),
        with: { attachments: true },
      },
      attachments: { orderBy: desc(prototypeAttachment.uploadedAt) },
      references: { orderBy: desc(prototypeReference.createdAt) },
    },
  });
}
