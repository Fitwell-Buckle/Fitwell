import { desc, eq, isNull, count } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminNotification } from "@/lib/schema";
import { sendEmail } from "@/lib/email/resend";
import { formatPoNumber } from "./sub-po";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "").split(",").filter(Boolean);

/**
 * A supplier finished their stage(s) and handed a line item off. Persist an
 * in-app admin notification AND email the admins. Email falls back to a console
 * log when RESEND_API_KEY is unset (same as the supplier magic-link helper), so
 * it "works" in dev. Best-effort: a failure here never blocks the stage advance.
 */
export async function notifyStageHandoff(params: {
  poId: string;
  poNumber: string;
  /** The handing-off supplier's sub-PO suffix (e.g. "A") — shown as 00118-A. */
  poSuffix?: string | null;
  lineItemId: string;
  sku: string;
  supplierId: string;
  /** The supplier handing the work off. */
  supplierName: string;
  /** The supplier (or "Complete") the work moves to next. */
  nextSupplierName: string;
}): Promise<void> {
  const poDisplay = formatPoNumber(params.poNumber, {
    suffix: params.poSuffix ?? undefined,
  });
  const title = `${params.supplierName} completed their stage on PO ${poDisplay}`;
  const body = `${params.sku} handed off from ${params.supplierName} to ${params.nextSupplierName}.`;

  try {
    await db.insert(adminNotification).values({
      type: "stage_handoff",
      title,
      body,
      poId: params.poId,
      lineItemId: params.lineItemId,
      supplierId: params.supplierId,
    });
  } catch (err) {
    console.error("Failed to record handoff notification:", err);
  }

  if (ADMIN_EMAILS.length === 0) return;
  const subject = `Stage handoff — PO ${poDisplay}`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
    <p style="font-size:15px;font-weight:600;margin:0">${title}</p>
    <p style="font-size:13px;color:#52525b;margin:6px 0 0">${body}</p>
  </div>`;

  if (!process.env.RESEND_API_KEY) {
    console.log(
      `\n──────────────────────────────────────────────\n` +
        `Admin notification → ${ADMIN_EMAILS.join(", ")}\n${title}\n${body}\n` +
        `(RESEND_API_KEY not set — logged for local dev)\n` +
        `──────────────────────────────────────────────\n`,
    );
    return;
  }
  try {
    await sendEmail({ to: ADMIN_EMAILS, subject, html });
  } catch (err) {
    console.error("Failed to email handoff notification:", err);
  }
}

/** Recent admin notifications, newest first (in-app inbox). */
export function listAdminNotifications(limit = 30) {
  return db.query.adminNotification.findMany({
    orderBy: desc(adminNotification.createdAt),
    limit,
  });
}

/** Count of unread admin notifications (for the nav badge). */
export async function unreadNotificationCount(): Promise<number> {
  const r = await db
    .select({ n: count() })
    .from(adminNotification)
    .where(isNull(adminNotification.readAt));
  return r[0]?.n ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  await db
    .update(adminNotification)
    .set({ readAt: new Date() })
    .where(eq(adminNotification.id, id));
}

export async function markAllNotificationsRead(): Promise<void> {
  await db
    .update(adminNotification)
    .set({ readAt: new Date() })
    .where(isNull(adminNotification.readAt));
}
