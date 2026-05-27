import { NextRequest, NextResponse } from "next/server";
import { ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { productionPo } from "@/lib/schema";
import { verifyCronOrAdmin } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/email/resend";
import {
  lineItemsNeedingAlert,
  posNeedingReceiveNag,
  type AlertLine,
  type DueLine,
  type NagPo,
} from "@/lib/production/alerts";
import { getStageOrder } from "@/lib/production/stage-labels";
import { terminalStage } from "@/lib/production/stages";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function li(d: DueLine): string {
  const tag = d.overdue ? " (overdue)" : "";
  return `<li>PO ${d.poNumber} — ${d.sku} ${d.title}: due ${d.dueDate}${tag}</li>`;
}

function ownerHtml(due: DueLine[], nags: { poNumber: string }[], withinDays: number): string {
  const dueBlock = due.length
    ? `<h2 style="font-size:15px">Line items due within ${withinDays} day(s)</h2><ul>${due.map(li).join("")}</ul>`
    : "";
  const nagBlock = nags.length
    ? `<h2 style="font-size:15px">Complete POs ready to receive into Shopify</h2><ul>${nags
        .map((n) => `<li>PO ${n.poNumber}</li>`)
        .join("")}</ul>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
    <h1 style="font-size:17px">Production deadlines</h1>${dueBlock}${nagBlock}</div>`;
}

function supplierHtml(supplierName: string, lines: DueLine[]): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
    <p style="font-size:14px">Hi ${supplierName}, the following items are due soon:</p>
    <ul>${lines.map(li).join("")}</ul>
    <p style="font-size:12px;color:#71717a">Sign in to the Fitwell supplier portal to update their stage.</p></div>`;
}

// Emails the owner a summary of upcoming/overdue line items and complete POs
// ready to receive, plus each supplier their own due items. Best-effort: when
// RESEND_API_KEY isn't set, it computes and reports without sending.
export async function GET(req: NextRequest) {
  if (!(await verifyCronOrAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const withinDays = clamp(
    parseInt(req.nextUrl.searchParams.get("days") ?? "3", 10) || 3,
    0,
    60,
  );
  const today = new Date().toISOString().slice(0, 10);

  const pos = await db.query.productionPo.findMany({
    where: ne(productionPo.status, "cancelled"),
    with: {
      supplier: { columns: { id: true, name: true, contactEmail: true } },
      lineItems: {
        columns: {
          id: true,
          sku: true,
          title: true,
          currentStage: true,
          expectedCompletionDate: true,
        },
      },
    },
  });

  const alertLines: AlertLine[] = pos.flatMap((po) =>
    po.lineItems.map((item) => ({
      id: item.id,
      sku: item.sku,
      title: item.title,
      currentStage: item.currentStage,
      // Effective due date: the line's own, else the PO's expected delivery.
      dueDate: item.expectedCompletionDate ?? po.expectedDeliveryDate ?? null,
      poId: po.id,
      poNumber: po.shopifyPoNumber,
      supplierId: po.supplierId,
      supplierName: po.supplier?.name ?? "—",
      supplierEmail: po.supplier?.contactEmail ?? null,
    })),
  );

  const terminal = terminalStage(await getStageOrder());
  const due = lineItemsNeedingAlert({ lineItems: alertLines, today, withinDays, terminal });

  const nagInput: NagPo[] = pos.map((po) => ({
    id: po.id,
    poNumber: po.shopifyPoNumber,
    lineStages: po.lineItems.map((item) => item.currentStage),
    receivedAt: po.shopifyReceivedAt,
  }));
  const nags = posNeedingReceiveNag(nagInput, terminal);

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const emailed = { owner: false, suppliers: 0 };
  let emailNote: string | undefined;

  if (!process.env.RESEND_API_KEY) {
    emailNote = "RESEND_API_KEY not set — emails skipped (computed only).";
  } else {
    if (adminEmails.length > 0 && (due.length > 0 || nags.length > 0)) {
      try {
        await sendEmail({
          to: adminEmails,
          subject: `Production: ${due.length} due, ${nags.length} ready to receive`,
          html: ownerHtml(due, nags, withinDays),
        });
        emailed.owner = true;
      } catch (err) {
        console.error("Owner alert email failed:", err);
      }
    }

    // Each supplier gets their own due lines (when we have an email for them).
    const bySupplier = new Map<string, { name: string; email: string; lines: DueLine[] }>();
    for (const d of due) {
      if (!d.supplierEmail) continue;
      const g = bySupplier.get(d.supplierId) ?? {
        name: d.supplierName,
        email: d.supplierEmail,
        lines: [],
      };
      g.lines.push(d);
      bySupplier.set(d.supplierId, g);
    }
    for (const g of bySupplier.values()) {
      try {
        await sendEmail({
          to: g.email,
          subject: `Fitwell: ${g.lines.length} item(s) due soon`,
          html: supplierHtml(g.name, g.lines),
        });
        emailed.suppliers++;
      } catch (err) {
        console.error("Supplier alert email failed:", err);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    today,
    withinDays,
    dueCount: due.length,
    nagCount: nags.length,
    due: due.map((d) => ({
      poNumber: d.poNumber,
      sku: d.sku,
      dueDate: d.dueDate,
      overdue: d.overdue,
    })),
    nags,
    emailed,
    emailNote,
  });
}
