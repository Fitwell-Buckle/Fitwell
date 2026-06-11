// Notification audience is encoded in the `type` column so suppliers and admins
// share one `admin_notification` table (the recipient supplier is the row's
// `supplier_id`). Anything in this set is supplier-bound; everything else is
// admin-bound (stage handoffs, supplier-posted notes/docs/updates, etc.).
export const SUPPLIER_NOTIFICATION_TYPES: string[] = [
  "note_for_supplier",
  "document_for_supplier",
  "update_for_supplier",
  "stage_checkin_for_supplier",
];

export function isSupplierNotificationType(type: string): boolean {
  return SUPPLIER_NOTIFICATION_TYPES.includes(type);
}
