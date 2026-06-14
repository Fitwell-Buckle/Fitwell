// Shared supplier-lead constants. Server/client-safe (no db imports) so UI
// and API consume the same source of truth — mirrors src/lib/crm/constants.ts.

// Supplier specialties, in the order they appear in the capture dropdown.
// Stored as free `text` on supplier_lead.supplier_type, validated at the API
// layer — adding a specialty here doesn't require a migration.
export const SUPPLIER_TYPES = [
  "metal_hardware",
  "plating_finishing",
  "springs_pins",
  "leather_strap",
  "packaging",
  "tooling_machining",
  "other",
] as const;
export type SupplierType = (typeof SUPPLIER_TYPES)[number];

// Supplier-lead lifecycle status. `dropped` is the soft-delete state;
// `converted` means it's been promoted into a real `supplier` row.
export const SUPPLIER_LEAD_STATUSES = [
  "active",
  "converted",
  "dropped",
] as const;
export type SupplierLeadStatus = (typeof SUPPLIER_LEAD_STATUSES)[number];

const SUPPLIER_TYPE_LABELS: Record<SupplierType, string> = {
  metal_hardware: "Metal & hardware",
  plating_finishing: "Plating & finishing",
  springs_pins: "Springs & pins",
  leather_strap: "Leather / strap",
  packaging: "Packaging",
  tooling_machining: "Tooling / machining",
  other: "Other",
};

export function supplierTypeLabel(type: string): string {
  return SUPPLIER_TYPE_LABELS[type as SupplierType] ?? type;
}
