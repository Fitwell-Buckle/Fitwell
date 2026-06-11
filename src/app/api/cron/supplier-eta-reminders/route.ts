import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { supplier, supplierContact } from "@/lib/schema";
import { verifyCronOrAdmin } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/email/resend";
import { getProductionSettings } from "@/lib/production/production-settings";
import { isReminderDue } from "@/lib/production/eta-reminder";
import {
  listSupplierMissingEtas,
  type MissingEtaPo,
} from "@/lib/production/missing-etas";

const PORTAL_BASE =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.fitwellbuckle.co";

function reminderHtml(supplierName: string, pos: MissingEtaPo[]): string {
  const total = pos.reduce((s, p) => s + p.missingCount, 0);
  const rows = pos
    .map(
      (p) =>
        `<li><a href="${PORTAL_BASE}/supplier/po/${p.poId}">${p.poNumber}</a> — ${p.missingCount} line item${p.missingCount === 1 ? "" : "s"} need a delivery date</li>`,
    )
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
    <p style="font-size:14px">Hi ${supplierName},</p>
    <p style="font-size:14px">${total} line item${total === 1 ? "" : "s"} on your Fitwell purchase orders still need an expected delivery date (Final ETA). Please open each PO and set the Final ETA for every line item so we can plan production.</p>
    <ul style="font-size:14px">${rows}</ul>
    <p style="font-size:12px;color:#71717a">Sign in to the Fitwell supplier portal to set them. You'll keep getting this reminder until every line has a date.</p>
  </div>`;
}

/**
 * Daily cron: email each supplier with un-set line-item ETAs, no more often
 * than every `etaReminderIntervalDays` days (per-supplier, off
 * `eta_reminder_last_sent_at`). The whole feature is gated by the
 * `eta_reminder_enabled` setting; the interval + toggle are editable in admin
 * Settings. A supplier with no outstanding ETAs has its clock reset so a future
 * batch reminds promptly.
 */
export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getProductionSettings();
  if (!settings.etaReminderEnabled) {
    return NextResponse.json({ ok: true, skipped: "disabled" });
  }

  const now = Date.now();
  const hasResend = !!process.env.RESEND_API_KEY;

  const suppliers = await db.query.supplier.findMany();
  let due = 0;
  let sent = 0;
  let cleared = 0;

  for (const sup of suppliers) {
    const missing = await listSupplierMissingEtas(sup.id);

    if (missing.length === 0) {
      // No outstanding ETAs — reset the clock so a future batch reminds promptly.
      if (sup.etaReminderLastSentAt) {
        await db
          .update(supplier)
          .set({ etaReminderLastSentAt: null })
          .where(eq(supplier.id, sup.id));
        cleared++;
      }
      continue;
    }

    if (
      !isReminderDue(sup.etaReminderLastSentAt, settings.etaReminderIntervalDays, now)
    ) {
      continue; // reminded recently — not due yet
    }
    due++;

    // Recipients: the supplier's contact email + every supplier_contact login,
    // deduped + lowercased (the same audience a PO send reaches).
    const contacts = await db
      .select({ email: supplierContact.email })
      .from(supplierContact)
      .where(eq(supplierContact.supplierId, sup.id));
    const recipients = Array.from(
      new Set(
        [sup.contactEmail, ...contacts.map((c) => c.email)]
          .filter((e): e is string => !!e)
          .map((e) => e.toLowerCase()),
      ),
    );
    if (recipients.length === 0) continue; // nowhere to send

    if (hasResend) {
      try {
        await sendEmail({
          to: recipients,
          subject: "Action needed: set delivery ETAs on your Fitwell POs",
          html: reminderHtml(sup.name, missing),
        });
      } catch (err) {
        console.error(`ETA reminder email failed for ${sup.id}:`, err);
        continue; // don't advance the clock when the send failed
      }
    }

    await db
      .update(supplier)
      .set({ etaReminderLastSentAt: new Date() })
      .where(eq(supplier.id, sup.id));
    sent++;
  }

  return NextResponse.json({
    ok: true,
    enabled: true,
    intervalDays: settings.etaReminderIntervalDays,
    due,
    sent,
    cleared,
    resend: hasResend,
  });
}
