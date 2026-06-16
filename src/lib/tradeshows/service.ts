import { and, asc, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tradeShow,
  tradeShowVendor,
  tradeShowVendorVoiceNote,
} from "@/lib/schema";
import { createLead, createLeadSchema } from "@/lib/crm/service";
import {
  createSupplierLead,
  createSupplierLeadSchema,
} from "@/lib/suppliers/lead-service";
import {
  type AddVoiceNoteInput,
  type UpdateVendorInput,
  type VendorForPromotion,
  vendorToCustomerLeadInput,
  vendorToSupplierLeadInput,
} from "./validation";

// ─── Shows ──────────────────────────────────────────────────────────

export async function listTradeShows(status = "active") {
  return db
    .select()
    .from(tradeShow)
    .where(eq(tradeShow.status, status))
    .orderBy(desc(tradeShow.startsOn), asc(tradeShow.name));
}

export async function getTradeShow(id: string) {
  return db.query.tradeShow.findFirst({ where: eq(tradeShow.id, id) });
}

// ─── Vendors ────────────────────────────────────────────────────────

export interface ListVendorsFilters {
  side?: string; // 'supplier' | 'customer' — matches that side OR 'both'
  visited?: boolean;
  priority?: boolean;
  followUpStatus?: string;
  search?: string;
}

export async function listVendors(
  tradeShowId: string,
  filters: ListVendorsFilters = {},
) {
  const conds: SQL[] = [eq(tradeShowVendor.tradeShowId, tradeShowId)];

  // A 'supplier' / 'customer' filter also includes 'both' vendors, since those
  // belong to either pipeline.
  if (filters.side === "supplier" || filters.side === "customer") {
    const sideCond = or(
      eq(tradeShowVendor.side, filters.side),
      eq(tradeShowVendor.side, "both"),
    );
    if (sideCond) conds.push(sideCond);
  }
  if (filters.visited !== undefined)
    conds.push(eq(tradeShowVendor.visited, filters.visited));
  if (filters.priority !== undefined)
    conds.push(eq(tradeShowVendor.priority, filters.priority));
  if (filters.followUpStatus)
    conds.push(eq(tradeShowVendor.followUpStatus, filters.followUpStatus));
  if (filters.search) {
    const q = `%${filters.search}%`;
    const searchCond = or(
      ilike(tradeShowVendor.companyName, q),
      ilike(tradeShowVendor.booth, q),
      ilike(tradeShowVendor.category, q),
      ilike(tradeShowVendor.contactName, q),
    );
    if (searchCond) conds.push(searchCond);
  }

  return db
    .select()
    .from(tradeShowVendor)
    .where(and(...conds))
    // Priority booths first, then alphabetical by booth so the list tracks the
    // floor plan.
    .orderBy(desc(tradeShowVendor.priority), asc(tradeShowVendor.booth));
}

export async function getVendor(id: string) {
  return db.query.tradeShowVendor.findFirst({
    where: eq(tradeShowVendor.id, id),
    with: {
      tradeShow: true,
      voiceNotes: { orderBy: (v, { desc }) => desc(v.createdAt) },
      lead: true,
      supplierLead: true,
    },
  });
}

export async function updateVendor(
  id: string,
  input: UpdateVendorInput,
  userId: string,
): Promise<{ id: string } | null> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (input.visited !== undefined) {
    patch.visited = input.visited;
    // Stamp who/when on the first visit; leave the original stamp intact if
    // toggled off and back on.
    if (input.visited) {
      const existing = await db.query.tradeShowVendor.findFirst({
        where: eq(tradeShowVendor.id, id),
        columns: { visitedAt: true },
      });
      if (existing && !existing.visitedAt) {
        patch.visitedAt = new Date();
        patch.visitedByUserId = userId;
      }
    }
  }
  if (input.sampleGiven !== undefined) {
    patch.sampleGiven = input.sampleGiven;
    // Stamp the first time we record a sample given; leave it on subsequent
    // toggles so the original date survives.
    if (input.sampleGiven) {
      const existing = await db.query.tradeShowVendor.findFirst({
        where: eq(tradeShowVendor.id, id),
        columns: { sampleGivenAt: true },
      });
      if (existing && !existing.sampleGivenAt) patch.sampleGivenAt = new Date();
    }
  }
  if (input.followUpStatus !== undefined)
    patch.followUpStatus = input.followUpStatus;
  if (input.nextSteps !== undefined) patch.nextSteps = input.nextSteps || null;
  if (input.notes !== undefined) patch.notes = input.notes || null;
  if (input.side !== undefined) patch.side = input.side;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.contactName !== undefined)
    patch.contactName = input.contactName || null;
  if (input.email !== undefined) patch.email = input.email || null;
  if (input.phone !== undefined) patch.phone = input.phone || null;
  if (input.title !== undefined) patch.title = input.title || null;
  if (input.website !== undefined) patch.website = input.website || null;
  if (input.addressLine1 !== undefined)
    patch.addressLine1 = input.addressLine1 || null;
  if (input.addressLine2 !== undefined)
    patch.addressLine2 = input.addressLine2 || null;
  if (input.city !== undefined) patch.city = input.city || null;
  if (input.region !== undefined) patch.region = input.region || null;
  if (input.postalCode !== undefined)
    patch.postalCode = input.postalCode || null;
  if (input.country !== undefined) patch.country = input.country || null;
  if (input.cardImageUrl !== undefined)
    patch.cardImageUrl = input.cardImageUrl || null;
  if (input.cardRawText !== undefined)
    patch.cardRawText = input.cardRawText || null;
  if (input.ocrConfidence !== undefined)
    patch.ocrConfidence = input.ocrConfidence ?? null;

  const [row] = await db
    .update(tradeShowVendor)
    .set(patch)
    .where(eq(tradeShowVendor.id, id))
    .returning({ id: tradeShowVendor.id });
  return row ?? null;
}

// Hard-delete a vendor we don't want to track (not a lead in either
// direction). Cascades its voice notes via the FK. Any lead/supplier-lead
// already promoted from it is left intact — only the worklist row goes.
export async function deleteVendor(
  id: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .delete(tradeShowVendor)
    .where(eq(tradeShowVendor.id, id))
    .returning({ id: tradeShowVendor.id });
  return row ?? null;
}

// ─── Voice notes ────────────────────────────────────────────────────

export async function addVoiceNote(
  vendorId: string,
  input: AddVoiceNoteInput,
  userId: string,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(tradeShowVendorVoiceNote)
    .values({
      vendorId,
      blobUrl: input.blobUrl,
      contentType: input.contentType ?? null,
      sizeBytes: input.sizeBytes ?? null,
      durationSec: input.durationSec ?? null,
      transcript: input.transcript ?? null,
      recordedByUserId: userId,
    })
    .returning({ id: tradeShowVendorVoiceNote.id });
  // Visiting the booth long enough to record a note implies a visit.
  await db
    .update(tradeShowVendor)
    .set({ updatedAt: new Date() })
    .where(eq(tradeShowVendor.id, vendorId));
  return { id: row.id };
}

export async function listVoiceNotes(vendorId: string) {
  return db
    .select()
    .from(tradeShowVendorVoiceNote)
    .where(eq(tradeShowVendorVoiceNote.vendorId, vendorId))
    .orderBy(desc(tradeShowVendorVoiceNote.createdAt));
}

// ─── Promote into the CRM pipelines ─────────────────────────────────

export interface PromoteVendorResult {
  leadId?: string;
  supplierLeadId?: string;
}

// Push a vendor into one of the existing pipelines, carrying the card data and
// booth context over. Idempotent per side: a vendor already linked on the
// requested side returns the existing link instead of creating a duplicate.
export async function promoteVendor(
  vendorId: string,
  target: "supplier" | "customer",
  userId: string,
): Promise<PromoteVendorResult | null> {
  const vendor = await db.query.tradeShowVendor.findFirst({
    where: eq(tradeShowVendor.id, vendorId),
    with: { tradeShow: true },
  });
  if (!vendor) return null;

  const forPromotion: VendorForPromotion = {
    companyName: vendor.companyName,
    contactName: vendor.contactName,
    email: vendor.email,
    phone: vendor.phone,
    title: vendor.title,
    website: vendor.website,
    addressLine1: vendor.addressLine1,
    addressLine2: vendor.addressLine2,
    city: vendor.city,
    region: vendor.region,
    postalCode: vendor.postalCode,
    country: vendor.country,
    category: vendor.category,
    seedNotes: vendor.seedNotes,
    notes: vendor.notes,
    nextSteps: vendor.nextSteps,
    cardImageUrl: vendor.cardImageUrl,
    cardRawText: vendor.cardRawText,
    ocrConfidence: vendor.ocrConfidence,
  };
  const showName = vendor.tradeShow?.name ?? "a trade show";

  if (target === "supplier") {
    if (vendor.supplierLeadId)
      return { supplierLeadId: vendor.supplierLeadId };
    const parsed = createSupplierLeadSchema.parse(
      vendorToSupplierLeadInput(forPromotion, showName),
    );
    const { id } = await createSupplierLead(parsed, {
      capturedByUserId: userId,
    });
    await db
      .update(tradeShowVendor)
      .set({ supplierLeadId: id, updatedAt: new Date() })
      .where(eq(tradeShowVendor.id, vendorId));
    return { supplierLeadId: id };
  }

  // customer
  if (vendor.leadId) return { leadId: vendor.leadId };
  const sourceChannel =
    vendor.tradeShow?.sourceChannel ?? "b2b_trade_shows_industry";
  const parsed = createLeadSchema.parse(
    vendorToCustomerLeadInput(forPromotion, showName, sourceChannel),
  );
  const { id } = await createLead(parsed, {
    capturedByUserId: userId,
    defaultOwnerToCapturer: true,
  });
  await db
    .update(tradeShowVendor)
    .set({ leadId: id, updatedAt: new Date() })
    .where(eq(tradeShowVendor.id, vendorId));
  return { leadId: id };
}
