import { and, count, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminNotification } from "@/lib/schema";
import { createAdminNotification } from "@/lib/notifications/admin-notify";
import { sendEmail } from "@/lib/email/resend";
import { fmtMoney } from "@/lib/production/display";

// Admin-bound B2B portal alerts. All are admin notifications (not in
// SUPPLIER_NOTIFICATION_TYPES), so they count toward the Notifications badge +
// Web Push automatically. The order-related ones also drive the blue dot on the
// "Orders" nav item and clear when an admin opens the B2B orders list.
const B2B_ORDER_TYPE = "b2b_order";
const B2B_PAYMENT_TYPE = "b2b_payment";
const B2B_DRAFT_TYPE = "b2b_draft";
const B2B_LOGIN_TYPE = "b2b_login";

// Types surfaced on the Orders nav dot (and cleared by markB2bOrdersRead). A
// login is about a customer, not an order, so it stays inbox/badge-only.
const ORDER_DOT_TYPES = [B2B_ORDER_TYPE, B2B_PAYMENT_TYPE, B2B_DRAFT_TYPE];

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
 * Shared chokepoint for the B2B-portal admin alerts: record the in-app
 * notification (which also fans out to Web Push via createAdminNotification) and
 * email the admins (ADMIN_EMAILS), with the no-RESEND_API_KEY console fallback.
 * Best-effort — never throws, so it can't fail the action that triggered it.
 */
async function notifyB2bEvent(opts: {
  type: string;
  title: string;
  body: string;
  href: string;
  emailSubject: string;
  emailCtaLabel: string;
}): Promise<void> {
  try {
    await createAdminNotification({
      type: opts.type,
      title: opts.title,
      body: opts.body,
      href: opts.href,
    });
  } catch (err) {
    console.error(`Failed to record ${opts.type} notification:`, err);
  }

  const admins = adminEmails();
  if (admins.length === 0) return;
  const url = `${portalBaseUrl()}${opts.href}`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
    <p style="font-size:15px;font-weight:600;margin:0">${escapeHtml(opts.title)}</p>
    <p style="font-size:13px;color:#52525b;margin:6px 0 0">${escapeHtml(opts.body)}</p>
    <p style="margin:14px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;font-size:13px;font-weight:500;color:#fff;background:#18181b;text-decoration:none;padding:8px 14px;border-radius:6px">${escapeHtml(opts.emailCtaLabel)}</a></p>
  </div>`;

  if (!process.env.RESEND_API_KEY) {
    console.log(
      `\n──────────────────────────────────────────────\n` +
        `${opts.type} → ${admins.join(", ")}\n${opts.title}\n${opts.body}\n` +
        `(RESEND_API_KEY not set — logged for local dev)\n` +
        `──────────────────────────────────────────────\n`,
    );
    return;
  }
  try {
    await sendEmail({ to: admins, subject: opts.emailSubject, html });
  } catch (err) {
    console.error(`Failed to email ${opts.type} notification:`, err);
  }
}

/**
 * Fire on a brand-new B2B portal order (first submit, draft → sent): admin
 * notification (Orders nav dot + Notifications badge + push) + email.
 */
export async function notifyNewB2bOrder(params: {
  invoiceId: string;
  invoiceNumber: string;
  companyName: string;
  totalCents: number;
  paymentMethod: "card" | "wire";
}): Promise<void> {
  await notifyB2bEvent({
    type: B2B_ORDER_TYPE,
    title: `New B2B order ${params.invoiceNumber} from ${params.companyName}`,
    body: `${fmtMoney(params.totalCents)} — paying by ${
      params.paymentMethod === "wire" ? "bank wire" : "card"
    }.`,
    href: `/invoices/${params.invoiceId}`,
    emailSubject: `New B2B order — ${params.invoiceNumber} (${params.companyName})`,
    emailCtaLabel: "View order",
  });
}

/** Fire when a portal pay-link payment is detected (deposit / balance / full). */
export async function notifyB2bPayment(params: {
  invoiceId: string;
  invoiceNumber: string;
  companyName: string;
  amountCents: number;
  kind: "deposit" | "balance" | "full";
}): Promise<void> {
  const label =
    params.kind === "deposit" ? "Deposit" : params.kind === "balance" ? "Balance" : "Payment";
  await notifyB2bEvent({
    type: B2B_PAYMENT_TYPE,
    title: `${label} received — ${params.invoiceNumber} (${params.companyName})`,
    body: `${fmtMoney(params.amountCents)} paid.${
      params.kind === "deposit" ? " Balance still due." : ""
    }`,
    href: `/invoices/${params.invoiceId}`,
    emailSubject: `${label} received — ${params.invoiceNumber} (${params.companyName})`,
    emailCtaLabel: "View order",
  });
}

/**
 * Fire when a customer emails to say they've sent a bank wire. Unlike a card
 * payment this is an unverified CLAIM, so it never auto-marks paid — the alert
 * prompts an admin to confirm with the bank first, then mark it paid manually.
 */
export async function notifyB2bWireClaim(params: {
  companyId: string;
  companyName: string;
  invoiceId?: string;
  invoiceNumber?: string;
  fromEmail: string;
}): Promise<void> {
  const ref = params.invoiceNumber ? ` for ${params.invoiceNumber}` : "";
  await notifyB2bEvent({
    type: B2B_PAYMENT_TYPE,
    title: `Wire payment claimed${ref} — ${params.companyName}`,
    body: `${params.fromEmail} emailed to say they sent a bank wire${ref}. Verify with the bank before marking it paid.`,
    href: params.invoiceId
      ? `/invoices/${params.invoiceId}`
      : `/customers/brands/${params.companyId}`,
    emailSubject: `Verify wire payment${ref} — ${params.companyName}`,
    emailCtaLabel: params.invoiceId ? "View order" : "View customer",
  });
}

/** Fire when a buyer saves a NEW draft order in the portal. */
export async function notifyB2bDraft(params: {
  invoiceId: string;
  invoiceNumber: string;
  companyName: string;
}): Promise<void> {
  await notifyB2bEvent({
    type: B2B_DRAFT_TYPE,
    title: `Draft order started — ${params.companyName}`,
    body: `${params.invoiceNumber} saved as a draft in the portal.`,
    href: `/invoices/${params.invoiceId}`,
    emailSubject: `Draft order started — ${params.invoiceNumber} (${params.companyName})`,
    emailCtaLabel: "View draft",
  });
}

/** Fire when a company contact signs in to the B2B portal. */
export async function notifyB2bLogin(params: {
  companyId: string;
  companyName: string;
  email: string;
}): Promise<void> {
  await notifyB2bEvent({
    type: B2B_LOGIN_TYPE,
    title: `Portal login — ${params.companyName}`,
    body: `${params.email} signed in to the B2B portal.`,
    href: `/customers/brands/${params.companyId}`,
    emailSubject: `Portal login — ${params.companyName}`,
    emailCtaLabel: "View customer",
  });
}

/** Unread order-related B2B notifications — drives the "Orders" nav blue dot. */
export async function countNewB2bOrders(): Promise<number> {
  const r = await db
    .select({ n: count() })
    .from(adminNotification)
    .where(and(inArray(adminNotification.type, ORDER_DOT_TYPES), isNull(adminNotification.readAt)));
  return r[0]?.n ?? 0;
}

/** Mark order-related B2B notifications read — called when an admin opens Orders. */
export async function markB2bOrdersRead(): Promise<void> {
  await db
    .update(adminNotification)
    .set({ readAt: new Date() })
    .where(and(inArray(adminNotification.type, ORDER_DOT_TYPES), isNull(adminNotification.readAt)));
}
