/**
 * Team alerts for the public /creator-signup form. On a new submission we:
 *  - record an admin notification (Notifications badge + Web Push, via
 *    createAdminNotification), and
 *  - email ADMIN_EMAILS (Resend), with the no-key console fallback.
 * Best-effort — never throws, so it can't fail the signup it's reporting.
 *
 * The Creators nav blue dot is driven separately by countUnreviewedSignups()
 * (state-based: clears when the team approves/rejects the signup), so it
 * survives a page refresh and doesn't depend on notification read state.
 */

import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { creator } from "@/lib/schema";
import { createAdminNotification } from "@/lib/notifications/admin-notify";
import { sendEmail } from "@/lib/email/resend";
import { signupPlatformLabel } from "./signup";

// Tap target: the Creators list, pre-filtered to the self-registration queue.
const SIGNUP_HREF = "/creators?source=self_registration";

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

export interface SignupNotice {
  name: string;
  profiles: { platform: string; handle: string }[];
  email?: string | null;
  phone?: string | null;
}

/** Fire on a new public creator signup: admin notification + email to the team. */
export async function notifyNewCreatorSignup(notice: SignupNotice): Promise<void> {
  const channels =
    notice.profiles
      .map((p) => `${signupPlatformLabel(p.platform)} @${p.handle}`)
      .join(", ") || "no channels listed";
  const contact = [notice.email, notice.phone].filter(Boolean).join(" · ");
  const title = `New creator signup — ${notice.name}`;
  const body = contact ? `${channels} · ${contact}` : channels;

  try {
    await createAdminNotification({
      type: "creator_signup",
      title,
      body,
      href: SIGNUP_HREF,
    });
  } catch (err) {
    console.error("Failed to record creator_signup notification:", err);
  }

  const admins = adminEmails();
  if (admins.length === 0) return;
  const url = `${portalBaseUrl()}${SIGNUP_HREF}`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
    <p style="font-size:15px;font-weight:600;margin:0">${escapeHtml(title)}</p>
    <p style="font-size:13px;color:#52525b;margin:6px 0 0">${escapeHtml(body)}</p>
    <p style="margin:14px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;font-size:13px;font-weight:500;color:#fff;background:#18181b;text-decoration:none;padding:8px 14px;border-radius:6px">Review signup</a></p>
  </div>`;

  if (!process.env.RESEND_API_KEY) {
    console.log(
      `\n──────────────────────────────────────────────\n` +
        `creator_signup → ${admins.join(", ")}\n${title}\n${body}\n` +
        `(RESEND_API_KEY not set — logged for local dev)\n` +
        `──────────────────────────────────────────────\n`,
    );
    return;
  }
  try {
    await sendEmail({ to: admins, subject: title, html });
  } catch (err) {
    console.error("Failed to email creator_signup notification:", err);
  }
}

/** Unreviewed self-registered creators — drives the "Creators" nav blue dot. */
export async function countUnreviewedSignups(): Promise<number> {
  const r = await db
    .select({ n: count() })
    .from(creator)
    .where(
      and(
        eq(creator.source, "self_registration"),
        eq(creator.vettingStatus, "unreviewed"),
      ),
    );
  return r[0]?.n ?? 0;
}
