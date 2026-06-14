// Shared supplier-lead constants. Server/client-safe (no db imports) so UI
// and API consume the same source of truth — mirrors src/lib/crm/constants.ts.

// Built-in supplier personas (the multi-select's seed options). Stored on
// supplier_lead.supplier_types as the display string itself. "Other" in the UI
// lets you add a free-text persona — once a lead is saved with it, that value
// is merged into the dropdown for everyone next time (see listSupplierTypeOptions
// in lead-service.ts). So this is a *seed* list, not a closed enum.
export const SUPPLIER_PERSONA_PRESETS = [
  "Rapid Prototyping",
  "Full Production",
] as const;

// Supplier-lead lifecycle status. `dropped` is the soft-delete state;
// `converted` means it's been promoted into a real `supplier` row.
export const SUPPLIER_LEAD_STATUSES = [
  "active",
  "converted",
  "dropped",
] as const;
export type SupplierLeadStatus = (typeof SUPPLIER_LEAD_STATUSES)[number];

// Normalize a free-text persona for storage/compare: collapse whitespace and
// trim. Values are stored verbatim (no casing change) so users keep their
// preferred capitalization.
export function normalizeSupplierType(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}
