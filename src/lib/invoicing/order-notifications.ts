import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminNotification } from "@/lib/schema";
import { sendEmail } from "@/lib/email/resend";
import { fmtMoney } from "@/lib/production/display";

// A new B2B order placed via the customer portal. Admin-bound (not in
// SUPPLIER_NOTIFICATION_TYPES), so it counts toward the Notifications badge and
// drives the blue dot on the "Orders" nav item. Cleared when an admin opens the
// B2B orders list (markB2bOrdersRead).
const B2B_ORDER_TYPE = "b2b_order";

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function portalBaseUrl(): string {
  return (
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    "https://portal.fitwellbuckle.co"
  ).replace(/\/+$/, "");
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

/**
 * Fire on a brand-new B2B portal order (first submit, draft → sent): record an
 * admin notification (drives the Orders nav dot + Notifications badge) and email
 * the admins. Best-effort — never throws, so it can't fail the order.
 */
export async function notifyNewB2bOrder(params: {
  invoiceId: string;
  invoiceNumber: string;
  companyName: string;
  totalCents: number;
  paymentMethod: "card" | "wire";
}): Promise<void> {
  const title = `New B2B order ${params.invoiceNumber} from ${params.companyName}`;
  const body = `${fmtMoney(params.totalCents)} — paying by ${
    params.paymentMethod === "wire" ? "bank wire" : "card"
  }.`;
  const href = `/invoices/${params.invoiceId}`;

  try {
    await db.insert(adminNotification).values({ type: B2B_ORDER_TYPE, title, body, href });
  } catch (err) {
    console.error("Failed to record new-order notification:", err);
  }

  const admins = adminEmails();
  if (admins.length === 0) return;
  const url = `${portalBaseUrl()}${href}`;
  const subject = `New B2B order — ${params.invoiceNumber} (${params.companyName})`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
    <p style="font-size:15px;font-weight:600;margin:0">${escapeHtml(title)}</p>
    <p style="font-size:13px;color:#52525b;margin:6px 0 0">${escapeHtml(body)}</p>
    <p style="margin:14px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;font-size:13px;font-weight:500;color:#fff;background:#18181b;text-decoration:none;padding:8px 14px;border-radius:6px">View order</a></p>
  </div>`;

  if (!process.env.RESEND_API_KEY) {
    console.log(
      `\n──────────────────────────────────────────────\n` +
        `New B2B order → ${admins.join(", ")}\n${title}\n${body}\n` +
        `(RESEND_API_KEY not set — logged for local dev)\n` +
        `──────────────────────────────────────────────\n`,
    );
    return;
  }
  try {
    await sendEmail({ to: admins, subject, html });
  } catch (err) {
    console.error("Failed to email new-order notification:", err);
  }
}

/** Unread new-B2B-order notifications — drives the "Orders" nav blue dot. */
export async function countNewB2bOrders(): Promise<number> {
  const r = await db
    .select({ n: count() })
    .from(adminNotification)
    .where(and(eq(adminNotification.type, B2B_ORDER_TYPE), isNull(adminNotification.readAt)));
  return r[0]?.n ?? 0;
}

/** Mark all new-order notifications read — called when an admin opens Orders. */
export async function markB2bOrdersRead(): Promise<void> {
  await db
    .update(adminNotification)
    .set({ readAt: new Date() })
    .where(and(eq(adminNotification.type, B2B_ORDER_TYPE), isNull(adminNotification.readAt)));
}
