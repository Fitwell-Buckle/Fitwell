import { z } from "zod";
import {
  FOLLOW_UP_STATUSES,
  FOLLOW_UP_TEMPS,
  LEAD_VALUE_MAX,
  LEAD_VALUE_MIN,
  VENDOR_SIDES,
} from "./constants";

// Pure, db-free validation + the vendor→pipeline mapping helpers, so they can
// be unit-tested without a database. The service layer (./service) imports
// these and does the actual persistence.

// PATCH body for a vendor: every field optional (partial update). `visited` is
// special-cased in the service (stamps visitedAt / visitedByUserId).
export const updateVendorSchema = z.object({
  visited: z.boolean().optional(),
  sampleGiven: z.boolean().optional(),
  followUpStatus: z.enum(FOLLOW_UP_STATUSES).optional(),
  // Triage classification (both nullable → null clears the rating).
  followUpTemp: z.enum(FOLLOW_UP_TEMPS).nullish(),
  leadValue: z.number().int().min(LEAD_VALUE_MIN).max(LEAD_VALUE_MAX).nullish(),
  nextSteps: z.string().nullish(),
  notes: z.string().nullish(),
  side: z.enum(VENDOR_SIDES).optional(),
  priority: z.boolean().optional(),
  contactName: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  title: z.string().nullish(),
  website: z.string().nullish(),
  addressLine1: z.string().nullish(),
  addressLine2: z.string().nullish(),
  city: z.string().nullish(),
  region: z.string().nullish(),
  postalCode: z.string().nullish(),
  country: z.string().nullish(),
  // Card scan fields (set after the client runs /scan-card and the user
  // confirms the extraction).
  cardImageUrl: z.string().nullish(),
  cardRawText: z.string().nullish(),
  ocrConfidence: z.record(z.string(), z.number()).nullish(),
});
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;

export const addVoiceNoteSchema = z.object({
  blobUrl: z.string().url(),
  contentType: z.string().nullish(),
  sizeBytes: z.number().int().nonnegative().nullish(),
  durationSec: z.number().nonnegative().nullish(),
  transcript: z.string().nullish(),
});
export type AddVoiceNoteInput = z.infer<typeof addVoiceNoteSchema>;

export const promoteVendorSchema = z.object({
  // Which pipeline to push the vendor into. A 'both' vendor can be promoted to
  // each side independently.
  target: z.enum(["supplier", "customer"]),
});
export type PromoteVendorInput = z.infer<typeof promoteVendorSchema>;

// A person met at a booth. Create + update share the same shape (all fields
// optional on update); the service stamps `is_primary` exclusivity.
export const createVendorContactSchema = z.object({
  firstName: z.string().max(200).nullish(),
  lastName: z.string().max(200).nullish(),
  title: z.string().max(200).nullish(),
  email: z.string().max(320).nullish(),
  phone: z.string().max(50).nullish(),
  notes: z.string().max(10_000).nullish(),
  isPrimary: z.boolean().optional(),
  cardImageUrl: z.string().url().max(2000).nullish(),
  cardRawText: z.string().max(10_000).nullish(),
  ocrConfidence: z.record(z.string(), z.number()).nullish(),
});
export type CreateVendorContactInput = z.infer<
  typeof createVendorContactSchema
>;

export const updateVendorContactSchema = createVendorContactSchema;
export type UpdateVendorContactInput = z.infer<
  typeof updateVendorContactSchema
>;

// A note added to the shared activity thread.
export const addVendorCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});
export type AddVendorCommentInput = z.infer<typeof addVendorCommentSchema>;

// Split a single free-text contact name into first/last for the lead tables,
// which store them separately. Everything after the first token becomes the
// surname; a single token is treated as a first name.
export function splitContactName(name: string | null | undefined): {
  firstName: string | null;
  lastName: string | null;
} {
  const trimmed = (name ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return { firstName: null, lastName: null };
  const parts = trimmed.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

// Shape of the vendor fields the mapping helpers below read. Kept structural
// (not the full Drizzle row) so the helpers stay db-free and testable.
export interface VendorForPromotion {
  companyName: string;
  // The chosen contact's fields (primary contact when promoting), resolved by
  // the caller from the contacts list.
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  category: string | null;
  seedNotes: string | null;
  notes: string | null;
  nextSteps: string | null;
  cardImageUrl: string | null;
  cardRawText: string | null;
  ocrConfidence: unknown;
}

// Stitch the booth context (category, seed intel, on-floor notes, next steps)
// into a single notes blob the promoted lead/supplier carries over, so none of
// the show context is lost.
function buildPromotionNotes(
  v: VendorForPromotion,
  showName: string,
): string | null {
  const parts: string[] = [`Met at ${showName}.`];
  if (v.category) parts.push(`Category: ${v.category}.`);
  if (v.seedNotes) parts.push(v.seedNotes);
  if (v.notes) parts.push(v.notes);
  if (v.nextSteps) parts.push(`Next steps: ${v.nextSteps}`);
  const joined = parts.join("\n").trim();
  return joined || null;
}

// Vendor → supplier-lead capture input (matches createSupplierLead's input).
export function vendorToSupplierLeadInput(
  v: VendorForPromotion,
  showName: string,
) {
  return {
    firstName: v.firstName ?? null,
    lastName: v.lastName ?? null,
    email: v.email ?? null,
    phone: v.phone ?? null,
    title: v.title ?? null,
    companyName: v.companyName,
    website: v.website ?? null,
    addressLine1: v.addressLine1 ?? null,
    addressLine2: v.addressLine2 ?? null,
    city: v.city ?? null,
    region: v.region ?? null,
    postalCode: v.postalCode ?? null,
    country: v.country ?? null,
    supplierTypes: v.category ? [v.category] : null,
    notes: buildPromotionNotes(v, showName),
    cardImageUrl: v.cardImageUrl ?? null,
    cardRawText: v.cardRawText ?? null,
    ocrConfidence: v.ocrConfidence ?? null,
  };
}

// Vendor → customer-lead capture input (matches createLead's input). The
// show's sourceChannel is required and supplied by the caller.
export function vendorToCustomerLeadInput(
  v: VendorForPromotion,
  showName: string,
  sourceChannel: string,
) {
  return {
    firstName: v.firstName ?? null,
    lastName: v.lastName ?? null,
    email: v.email ?? null,
    phone: v.phone ?? null,
    title: v.title ?? null,
    companyName: v.companyName,
    addressLine1: v.addressLine1 ?? null,
    addressLine2: v.addressLine2 ?? null,
    city: v.city ?? null,
    region: v.region ?? null,
    postalCode: v.postalCode ?? null,
    country: v.country ?? null,
    // stage is intentionally omitted — createLead defaults to `prospect`, which
    // is correct per b2b-pipeline.md: a booth contact isn't a `lead` until they
    // engage post-show. ('prospect' isn't a member of the createLead stage enum.)
    sourceChannel,
    notes: buildPromotionNotes(v, showName),
    cardImageUrl: v.cardImageUrl ?? null,
    cardRawText: v.cardRawText ?? null,
    ocrConfidence: v.ocrConfidence ?? null,
  };
}
