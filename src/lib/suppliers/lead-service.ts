import {
  and,
  arrayContains,
  desc,
  eq,
  getTableColumns,
  ilike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/lib/db";
import {
  supplier,
  supplierLead,
  supplierLeadCardImage,
  tradeShowVendor,
} from "@/lib/schema";
import { toNameCase } from "@/lib/crm/names";
import {
  SUPPLIER_PERSONA_PRESETS,
  normalizeSupplierType,
} from "./lead-constants";
import {
  type CreateSupplierLeadInput,
  type UpdateSupplierLeadInput,
  supplierLeadToSupplierInput,
} from "./lead-validation";

// Clean a multi-select persona array for storage: normalize whitespace, drop
// blanks, dedupe (case-insensitively, keeping first spelling). Returns null
// when nothing's left so the column stays NULL rather than an empty array.
function cleanSupplierTypes(
  values: string[] | null | undefined,
): string[] | null {
  if (!values) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const norm = normalizeSupplierType(v);
    if (!norm) continue;
    const key = norm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
  }
  return out.length ? out : null;
}

// ─── Supplier lead ──────────────────────────────────────────────────
//
// Mirrors src/lib/crm/service.ts but scoped to the supplier pipeline: no
// stage / source-channel / persona / follow-up machinery. A supplier lead is
// a captured business card that gets promoted into a real `supplier` row.
//
// Pure validation schemas + the lead→supplier mapping live in
// ./lead-validation (db-free, so they can be unit-tested). Re-exported here so
// API routes can keep importing everything from one module.
export {
  createSupplierLeadSchema,
  updateSupplierLeadSchema,
  supplierLeadToSupplierInput,
  type CreateSupplierLeadInput,
  type UpdateSupplierLeadInput,
} from "./lead-validation";

export interface CreateSupplierLeadOptions {
  capturedByUserId: string;
}

export async function createSupplierLead(
  input: CreateSupplierLeadInput,
  opts: CreateSupplierLeadOptions,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(supplierLead)
    .values({
      capturedByUserId: opts.capturedByUserId,
      firstName: toNameCase(input.firstName),
      lastName: toNameCase(input.lastName),
      email: input.email || null,
      phone: input.phone || null,
      title: input.title || null,
      companyName: input.companyName || null,
      website: input.website || null,
      addressLine1: input.addressLine1 || null,
      addressLine2: input.addressLine2 || null,
      city: input.city || null,
      region: input.region || null,
      postalCode: input.postalCode || null,
      country: input.country || null,
      supplierTypes: cleanSupplierTypes(input.supplierTypes),
      notes: input.notes || null,
      cardImageUrl: input.cardImageUrl || null,
      cardRawText: input.cardRawText || null,
      ocrConfidence: input.ocrConfidence ?? null,
    })
    .returning({ id: supplierLead.id });

  // Persist the card image (if any) into history so re-scans accumulate.
  if (input.cardImageUrl) {
    await db.insert(supplierLeadCardImage).values({
      supplierLeadId: row.id,
      blobUrl: input.cardImageUrl,
      uploadedByUserId: opts.capturedByUserId,
    });
  }
  return { id: row.id };
}

export async function updateSupplierLead(
  id: string,
  input: UpdateSupplierLeadInput,
): Promise<{ id: string } | null> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.firstName !== undefined)
    patch.firstName = toNameCase(input.firstName);
  if (input.lastName !== undefined) patch.lastName = toNameCase(input.lastName);
  if (input.email !== undefined) patch.email = input.email || null;
  if (input.phone !== undefined) patch.phone = input.phone || null;
  if (input.title !== undefined) patch.title = input.title || null;
  if (input.companyName !== undefined)
    patch.companyName = input.companyName || null;
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
  if (input.supplierTypes !== undefined)
    patch.supplierTypes = cleanSupplierTypes(input.supplierTypes);
  if (input.notes !== undefined) patch.notes = input.notes || null;
  if (input.status !== undefined) patch.status = input.status;

  const [row] = await db
    .update(supplierLead)
    .set(patch)
    .where(eq(supplierLead.id, id))
    .returning({ id: supplierLead.id });
  return row ?? null;
}

// Soft delete: flip status to 'dropped'. History is preserved.
export async function dropSupplierLead(
  id: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .update(supplierLead)
    .set({ status: "dropped", updatedAt: new Date() })
    .where(eq(supplierLead.id, id))
    .returning({ id: supplierLead.id });
  return row ?? null;
}

export async function getSupplierLead(id: string) {
  return db.query.supplierLead.findFirst({ where: eq(supplierLead.id, id) });
}

export interface ListSupplierLeadsFilters {
  status?: string;
  supplierType?: string;
  search?: string;
  // 'rating' = highest triage star value first (unrated last). Anything else
  // (incl. undefined) falls back to newest-captured-first.
  sort?: string;
}

// Triage rating carried over from the booth: a supplier lead is promoted from
// a trade-show vendor (tradeShowVendor.supplierLeadId), which holds the 1–5
// star value + hot/warm/cold temperature set during triage. Scalar subqueries
// (not a join) keep one row per lead; we take the highest-value vendor.
//
// The outer column is written fully-qualified as "supplier_lead"."id":
// embedding a Drizzle Column (${supplierLead.id}) renders it bare as "id",
// which the inner trade_show_vendor scope shadows with its own id column,
// breaking the correlation. Qualify it explicitly so it binds to the outer row.
const supplierTriageValue = sql<number | null>`(
  select v.lead_value
  from ${tradeShowVendor} v
  where v.supplier_lead_id = "supplier_lead"."id" and v.lead_value is not null
  order by v.lead_value desc
  limit 1
)`;
const supplierTriageTemp = sql<string | null>`(
  select v.follow_up_temp
  from ${tradeShowVendor} v
  where v.supplier_lead_id = "supplier_lead"."id" and v.follow_up_temp is not null
  order by v.lead_value desc nulls last
  limit 1
)`;

export async function listSupplierLeads(
  filters: ListSupplierLeadsFilters = {},
) {
  const conds: SQL[] = [];

  // Default to active-only — callers opt in to dropped/converted views.
  conds.push(eq(supplierLead.status, filters.status ?? "active"));

  if (filters.supplierType)
    conds.push(arrayContains(supplierLead.supplierTypes, [filters.supplierType]));

  if (filters.search) {
    const q = `%${filters.search}%`;
    const searchCond = or(
      ilike(supplierLead.firstName, q),
      ilike(supplierLead.lastName, q),
      ilike(supplierLead.email, q),
      ilike(supplierLead.companyName, q),
    );
    if (searchCond) conds.push(searchCond);
  }

  const order =
    filters.sort === "rating"
      ? [sql`${supplierTriageValue} desc nulls last`, desc(supplierLead.capturedAt)]
      : [desc(supplierLead.capturedAt)];

  return db
    .select({
      ...getTableColumns(supplierLead),
      leadValue: supplierTriageValue,
      followUpTemp: supplierTriageTemp,
    })
    .from(supplierLead)
    .where(and(...conds))
    .orderBy(...order);
}

// Options for the persona multi-select: the built-in presets first, then every
// other distinct persona ever saved on a supplier lead (alphabetical). This is
// what makes an "Other" entry stick — once a lead is saved with a custom
// persona it shows up here for everyone the next time the dropdown opens.
export async function listSupplierTypeOptions(): Promise<string[]> {
  const rows = await db
    .select({ types: supplierLead.supplierTypes })
    .from(supplierLead);
  const presets: string[] = [...SUPPLIER_PERSONA_PRESETS];
  const presetKeys = new Set(presets.map((p) => p.toLowerCase()));
  const extras = new Map<string, string>(); // lowercase key → first spelling
  for (const r of rows) {
    for (const v of r.types ?? []) {
      const norm = normalizeSupplierType(v);
      if (!norm) continue;
      const key = norm.toLowerCase();
      if (presetKeys.has(key) || extras.has(key)) continue;
      extras.set(key, norm);
    }
  }
  return [...presets, ...[...extras.values()].sort((a, b) => a.localeCompare(b))];
}

export interface AddSupplierLeadCardImageInput {
  supplierLeadId: string;
  blobUrl: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  uploadedByUserId?: string | null;
}

// Record a card scan against a supplier lead, bumping `card_image_url` to the
// newest url so the detail page always shows the most-recent card.
export async function addSupplierLeadCardImage(
  input: AddSupplierLeadCardImageInput,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(supplierLeadCardImage)
    .values({
      supplierLeadId: input.supplierLeadId,
      blobUrl: input.blobUrl,
      contentType: input.contentType ?? null,
      sizeBytes: input.sizeBytes ?? null,
      uploadedByUserId: input.uploadedByUserId ?? null,
    })
    .returning({ id: supplierLeadCardImage.id });
  await db
    .update(supplierLead)
    .set({ cardImageUrl: input.blobUrl, updatedAt: new Date() })
    .where(eq(supplierLead.id, input.supplierLeadId));
  return { id: row.id };
}

export async function listSupplierLeadCardImages(supplierLeadId: string) {
  return db
    .select()
    .from(supplierLeadCardImage)
    .where(eq(supplierLeadCardImage.supplierLeadId, supplierLeadId))
    .orderBy(desc(supplierLeadCardImage.uploadedAt));
}

// ─── Promote to supplier ────────────────────────────────────────────

export interface PromoteResult {
  supplierId: string;
}

// Create a real `supplier` row from a supplier lead, then mark the lead
// converted and link it. Idempotent-ish: a lead already linked to a supplier
// returns that existing supplier instead of creating a duplicate.
export async function promoteToSupplier(
  id: string,
): Promise<PromoteResult | null> {
  const lead = await getSupplierLead(id);
  if (!lead) return null;
  if (lead.supplierId) return { supplierId: lead.supplierId };

  const [created] = await db
    .insert(supplier)
    .values(supplierLeadToSupplierInput(lead))
    .returning({ id: supplier.id });

  await db
    .update(supplierLead)
    .set({
      supplierId: created.id,
      status: "converted",
      updatedAt: new Date(),
    })
    .where(eq(supplierLead.id, id));

  return { supplierId: created.id };
}
