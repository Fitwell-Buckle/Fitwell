import { db } from "@/lib/db";
import { adminNotification } from "@/lib/schema";
import { broadcastWebPush } from "@/lib/push/send";
import { isSupplierNotificationType } from "@/lib/production/notification-types";

export type AdminNotificationInsert = typeof adminNotification.$inferInsert;

// Where a notification's push tap should land. Prefer an explicit href; else
// derive a deep link from the entity the alert is about; else the inbox.
function deepLinkFor(v: AdminNotificationInsert): string {
  if (v.href) return v.href;
  if (v.poId) return `/modules/production/po/${v.poId}`;
  if (v.leadId) return `/leads/${v.leadId}`;
  return "/notifications";
}

/**
 * Single chokepoint for admin alerts: write the in-app notification row AND
 * fan it out to registered Web Push devices, so push mirrors the in-app inbox
 * 1:1. Push is best-effort — `broadcastWebPush` swallows its own errors, so a
 * failed/unconfigured push never affects the insert. Callers keep their own
 * try/catch around the insert exactly as before.
 */
export async function createAdminNotification(
  values: AdminNotificationInsert,
): Promise<void> {
  await db.insert(adminNotification).values(values);

  // Push mirrors the *admin* inbox 1:1. Supplier-bound rows live in the same
  // table but are read through the supplier inbox — never push those to admin
  // devices (and suppliers don't register push subscriptions anyway).
  if (isSupplierNotificationType(values.type)) return;

  await broadcastWebPush({
    title: values.title,
    body: values.body ?? undefined,
    url: deepLinkFor(values),
    // Collapse repeat alerts about the same entity into one notification.
    tag: values.poId ?? values.leadId ?? undefined,
  });
}
