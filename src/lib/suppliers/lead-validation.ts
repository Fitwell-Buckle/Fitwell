import { z } from "zod";
import type { supplier, supplierLead } from "@/lib/schema";
import { SUPPLIER_LEAD_STATUSES } from "./lead-constants";

// Multi-select supplier personas. Free-form (any string the user adds via
// "Other" is valid), deduped + emptiness-filtered at the service layer.
const supplierTypesSchema = z.array(z.string().trim().min(1).max(200)).nullish();

// Pure (db-free) validation + mapping for supplier leads. Kept out of
// lead-service.ts — which imports the db client — so these can be unit-tested
// hermetically. The schema *types* imported above are erased at compile time
// (`import type`), so this module never pulls in the database.

const confidenceSchema = z.record(z.string(), z.number().min(0).max(1));

// Used by POST /api/supplier-leads. At-least-one-identity required so a
// misfired capture doesn't save a blank row.
export const createSupplierLeadSchema = z
  .object({
    firstName: z.string().max(200).nullish(),
    lastName: z.string().max(200).nullish(),
    email: z.string().email().max(320).nullish().or(z.literal("")),
    phone: z.string().max(50).nullish(),
    title: z.string().max(200).nullish(),
    companyName: z.string().max(200).nullish(),
    website: z.string().max(500).nullish(),
    addressLine1: z.string().max(300).nullish(),
    addressLine2: z.string().max(300).nullish(),
    city: z.string().max(200).nullish(),
    region: z.string().max(200).nullish(),
    postalCode: z.string().max(40).nullish(),
    country: z.string().max(120).nullish(),
    supplierTypes: supplierTypesSchema,
    notes: z.string().max(10_000).nullish(),
    cardImageUrl: z.string().url().max(2000).nullish(),
    cardRawText: z.string().max(10_000).nullish(),
    ocrConfidence: confidenceSchema.nullish(),
  })
  .refine(
    (v) =>
      Boolean(
        v.firstName || v.lastName || v.email || v.phone || v.companyName,
      ),
    {
      message: "at least one of name/email/phone/company is required",
      path: ["firstName"],
    },
  );
export type CreateSupplierLeadInput = z.infer<typeof createSupplierLeadSchema>;

// Used by PATCH /api/supplier-leads/[id]. All optional. `status` here is the
// non-destructive transition path (use dropSupplierLead() for soft-delete).
export const updateSupplierLeadSchema = z.object({
  firstName: z.string().max(200).nullish(),
  lastName: z.string().max(200).nullish(),
  email: z.string().email().max(320).nullish().or(z.literal("")),
  phone: z.string().max(50).nullish(),
  title: z.string().max(200).nullish(),
  companyName: z.string().max(200).nullish(),
  website: z.string().max(500).nullish(),
  addressLine1: z.string().max(300).nullish(),
  addressLine2: z.string().max(300).nullish(),
  city: z.string().max(200).nullish(),
  region: z.string().max(200).nullish(),
  postalCode: z.string().max(40).nullish(),
  country: z.string().max(120).nullish(),
  supplierTypes: supplierTypesSchema,
  notes: z.string().max(10_000).nullish(),
  status: z.enum(SUPPLIER_LEAD_STATUSES).optional(),
});
export type UpdateSupplierLeadInput = z.infer<typeof updateSupplierLeadSchema>;

type SupplierLeadRow = typeof supplierLead.$inferSelect;
type SupplierInsert = typeof supplier.$inferInsert;

// Pure mapping from a captured supplier lead → the `supplier` insert shape.
// Falls back from company name → person name → email for the required
// `name`, and composes the free-text address lines into the single
// `shipping_address` column.
export function supplierLeadToSupplierInput(
  lead: Pick<
    SupplierLeadRow,
    | "firstName"
    | "lastName"
    | "email"
    | "phone"
    | "companyName"
    | "addressLine1"
    | "addressLine2"
    | "city"
    | "region"
    | "postalCode"
    | "country"
    | "notes"
  >,
): SupplierInsert {
  const personName = [lead.firstName, lead.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const name =
    (lead.companyName || "").trim() || personName || lead.email || "Untitled";
  const cityRegionPostal = [lead.city, lead.region, lead.postalCode]
    .filter(Boolean)
    .join(", ");
  const shippingAddress =
    [lead.addressLine1, lead.addressLine2, cityRegionPostal, lead.country]
      .filter(Boolean)
      .join("\n")
      .trim() || null;
  return {
    name,
    contactName: personName || null,
    contactEmail: lead.email || null,
    phone: lead.phone || null,
    shippingAddress,
    notes: lead.notes || null,
  };
}
