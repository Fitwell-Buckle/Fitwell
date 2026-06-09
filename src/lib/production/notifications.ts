import { and, desc, eq, inArray, isNull, notInArray, count } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adminNotification,
  productionPo,
  supplierContact,
} from "@/lib/schema";
import { sendEmail } from "@/lib/email/resend";
import { formatPoNumber } from "./sub-po";
import { SUPPLIER_NOTIFICATION_TYPES } from "./notification-types";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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

/** Recent admin notifications, newest first (in-app inbox). Supplier-bound
 *  rows (notes/docs we sent a supplier) live in the same table — exclude them. */
export function listAdminNotifications(limit = 30) {
  return db.query.adminNotification.findMany({
    where: notInArray(adminNotification.type, SUPPLIER_NOTIFICATION_TYPES),
    orderBy: desc(adminNotification.createdAt),
    limit,
  });
}

/** Count of unread admin notifications (for the nav badge). */
export async function unreadNotificationCount(): Promise<number> {
  const r = await db
    .select({ n: count() })
    .from(adminNotification)
    .where(
      and(
        isNull(adminNotification.readAt),
        notInArray(adminNotification.type, SUPPLIER_NOTIFICATION_TYPES),
      ),
    );
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
    .where(
      and(
        isNull(adminNotification.readAt),
        notInArray(adminNotification.type, SUPPLIER_NOTIFICATION_TYPES),
      ),
    );
}

// ─── Supplier-side inbox (same table, audience by type, scoped by supplierId) ──

/** Recent supplier-bound notifications for one supplier, newest first. */
export function listSupplierNotifications(supplierId: string, limit = 30) {
  return db.query.adminNotification.findMany({
    where: and(
      eq(adminNotification.supplierId, supplierId),
      inArray(adminNotification.type, SUPPLIER_NOTIFICATION_TYPES),
    ),
    orderBy: desc(adminNotification.createdAt),
    limit,
  });
}

export async function unreadSupplierNotificationCount(
  supplierId: string,
): Promise<number> {
  const r = await db
    .select({ n: count() })
    .from(adminNotification)
    .where(
      and(
        eq(adminNotification.supplierId, supplierId),
        isNull(adminNotification.readAt),
        inArray(adminNotification.type, SUPPLIER_NOTIFICATION_TYPES),
      ),
    );
  return r[0]?.n ?? 0;
}

/** Scoped to the supplier so a supplier can't mark another's notification. */
export async function markSupplierNotificationRead(
  id: string,
  supplierId: string,
): Promise<void> {
  await db
    .update(adminNotification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(adminNotification.id, id),
        eq(adminNotification.supplierId, supplierId),
        inArray(adminNotification.type, SUPPLIER_NOTIFICATION_TYPES),
      ),
    );
}

export async function markAllSupplierNotificationsRead(
  supplierId: string,
): Promise<void> {
  await db
    .update(adminNotification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(adminNotification.supplierId, supplierId),
        isNull(adminNotification.readAt),
        inArray(adminNotification.type, SUPPLIER_NOTIFICATION_TYPES),
      ),
    );
}

// ─── PO note / document activity notifications (both directions) ──────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function activityHtml(title: string, body: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
    <p style="font-size:15px;font-weight:600;margin:0">${escapeHtml(title)}</p>
    <p style="font-size:13px;color:#52525b;margin:6px 0 0;white-space:pre-wrap">${escapeHtml(body)}</p>
  </div>`;
}

/** Email with the same dev-log fallback as the handoff alert: when
 *  RESEND_API_KEY is unset, log instead of sending. Never throws. */
async function deliverEmail(params: {
  to: string[];
  subject: string;
  html: string;
  label: string;
}): Promise<void> {
  if (params.to.length === 0) return;
  if (!process.env.RESEND_API_KEY) {
    console.log(
      `\n──────────────────────────────────────────────\n` +
        `${params.label} → ${params.to.join(", ")}\n${params.subject}\n` +
        `(RESEND_API_KEY not set — logged for local dev)\n` +
        `──────────────────────────────────────────────\n`,
    );
    return;
  }
  try {
    await sendEmail({ to: params.to, subject: params.subject, html: params.html });
  } catch (err) {
    console.error(`Failed to send ${params.label} email:`, err);
  }
}

async function recordNotification(values: {
  type: string;
  title: string;
  body: string;
  poId: string;
  supplierId: string | null;
}): Promise<void> {
  try {
    await db.insert(adminNotification).values(values);
  } catch (err) {
    console.error("Failed to record notification:", err);
  }
}

async function supplierContactEmails(supplierId: string): Promise<string[]> {
  const rows = await db
    .select({ email: supplierContact.email })
    .from(supplierContact)
    .where(eq(supplierContact.supplierId, supplierId));
  return rows.map((r) => r.email).filter(Boolean);
}

/**
 * A PO field was edited (ETA, stage, status, line costs, etc.) — notify the
 * other party in-app and by email. Mirrors notifyPoActivity: a supplier
 * writing notifies the admins, an internal user writing notifies the PO's
 * supplier. Best-effort: a failure here never throws back into the request.
 */
export async function notifyPoUpdate(params: {
  poId: string;
  /** Short, present-tense description of the change. Goes in the title and
   *  the email body (so keep it human-readable: "Advanced PO to Shipping",
   *  "Updated expected delivery to 2026-07-15", "Cleared line costs"). */
  summary: string;
  actor: {
    role?: string | null;
    name?: string | null;
    supplierId?: string | null;
  };
}): Promise<void> {
  try {
    const po = await db.query.productionPo.findFirst({
      where: eq(productionPo.id, params.poId),
      columns: { id: true, shopifyPoNumber: true, supplierId: true, poSuffix: true },
      with: { supplier: { columns: { name: true } } },
    });
    if (!po) return;

    const poDisplay = formatPoNumber(po.shopifyPoNumber, {
      suffix: po.poSuffix ?? undefined,
    });
    const subject = `PO ${poDisplay} updated — ${truncate(params.summary, 80)}`;

    if (params.actor.role === "supplier") {
      const supplierName = po.supplier?.name ?? "A supplier";
      const title = `${supplierName} updated PO ${poDisplay}`;
      await recordNotification({
        type: "update_for_admin",
        title,
        body: params.summary,
        poId: po.id,
        supplierId: params.actor.supplierId ?? po.supplierId,
      });
      await deliverEmail({
        to: ADMIN_EMAILS,
        subject,
        html: activityHtml(title, params.summary),
        label: "Admin notification",
      });
    } else {
      const author = params.actor.name ?? "Fitwell";
      const title = `${author} (Fitwell) updated PO ${poDisplay}`;
      await recordNotification({
        type: "update_for_supplier",
        title,
        body: params.summary,
        poId: po.id,
        supplierId: po.supplierId,
      });
      const to = po.supplierId ? await supplierContactEmails(po.supplierId) : [];
      await deliverEmail({
        to,
        subject,
        html: activityHtml(title, params.summary),
        label: "Supplier notification",
      });
    }
  } catch (err) {
    console.error("notifyPoUpdate failed:", err);
  }
}

/**
 * A note or document was posted on a PO — notify the other party in-app and by
 * email. A supplier posting notifies the admins (admin inbox + ADMIN_EMAILS); an
 * internal user posting notifies the PO's supplier (supplier inbox + the
 * supplier's contact emails). Best-effort: never throws into the request.
 */
export async function notifyPoActivity(params: {
  poId: string;
  kind: "note" | "document";
  /** Comment body (for notes) or filename (for documents). */
  preview: string;
  actor: {
    role?: string | null;
    name?: string | null;
    supplierId?: string | null;
  };
}): Promise<void> {
  try {
    const po = await db.query.productionPo.findFirst({
      where: eq(productionPo.id, params.poId),
      columns: { id: true, shopifyPoNumber: true, supplierId: true, poSuffix: true },
      with: { supplier: { columns: { name: true } } },
    });
    if (!po) return;

    const poDisplay = formatPoNumber(po.shopifyPoNumber, {
      suffix: po.poSuffix ?? undefined,
    });
    const noun = params.kind === "note" ? "note" : "document";
    const detail =
      params.kind === "note"
        ? truncate(params.preview, 200)
        : `Uploaded ${params.preview}`;
    const subject = `New ${noun} — PO ${poDisplay}`;

    if (params.actor.role === "supplier") {
      // Supplier → admins.
      const supplierName = po.supplier?.name ?? "A supplier";
      const title = `${supplierName} added a ${noun} on PO ${poDisplay}`;
      await recordNotification({
        type: params.kind === "note" ? "note_for_admin" : "document_for_admin",
        title,
        body: detail,
        poId: po.id,
        supplierId: params.actor.supplierId ?? po.supplierId,
      });
      await deliverEmail({
        to: ADMIN_EMAILS,
        subject,
        html: activityHtml(title, detail),
        label: "Admin notification",
      });
    } else {
      // Internal user → the PO's supplier.
      const author = params.actor.name ?? "Fitwell";
      const title = `${author} (Fitwell) added a ${noun} on PO ${poDisplay}`;
      await recordNotification({
        type:
          params.kind === "note" ? "note_for_supplier" : "document_for_supplier",
        title,
        body: detail,
        poId: po.id,
        supplierId: po.supplierId,
      });
      const to = po.supplierId ? await supplierContactEmails(po.supplierId) : [];
      await deliverEmail({
        to,
        subject,
        html: activityHtml(title, detail),
        label: "Supplier notification",
      });
    }
  } catch (err) {
    console.error("notifyPoActivity failed:", err);
  }
}
