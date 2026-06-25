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
import { getCatalogGroupsCached } from "@/lib/catalog/load";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function portalBaseUrl(): string {
  return (
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    "https://portal.fitwellbuckle.co"
  ).replace(/\/+$/, "");
}

function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

// Supplier-email line (keeps the PO number — a supplier's items can span POs).
function li(d: DueLine): string {
  const tag = d.overdue ? " (overdue)" : "";
  return `<li>PO ${esc(d.poNumber)} — ${esc(d.sku)} ${esc(d.title)}: due ${d.dueDate}${tag}</li>`;
}

// Owner-email line (the PO is the card header, so no PO prefix here).
function ownerLi(d: DueLine): string {
  const tag = d.overdue ? " (overdue)" : "";
  return `<li>${esc(d.sku)} ${esc(d.title)} — due ${d.dueDate}${tag}</li>`;
}

// One PO card in the owner email: PO number, vendor, collections, an Open PO
// button, and (for due items) the line items underneath.
export interface OwnerPoCard {
  poNumber: string;
  supplierName: string;
  collections: string;
  openUrl: string;
  lines: DueLine[];
}

function poCard(c: OwnerPoCard): string {
  const items = c.lines.length
    ? `<ul style="margin:8px 0 0;padding-left:18px">${c.lines.map(ownerLi).join("")}</ul>`
    : "";
  return `<div style="border:1px solid #e4e4e7;border-radius:8px;padding:12px 14px;margin:10px 0">
    <div style="font-size:14px;font-weight:600;color:#18181b">PO ${esc(c.poNumber)}</div>
    <div style="font-size:13px;color:#52525b;margin-top:2px">Vendor: ${esc(c.supplierName)}</div>
    <div style="font-size:13px;color:#52525b">Collections: ${esc(c.collections)}</div>${items}
    <p style="margin:10px 0 0"><a href="${esc(c.openUrl)}" style="display:inline-block;font-size:13px;font-weight:500;color:#fff;background:#18181b;text-decoration:none;padding:7px 12px;border-radius:6px">Open PO</a></p>
  </div>`;
}

function ownerHtml(dueCards: OwnerPoCard[], nagCards: OwnerPoCard[], withinDays: number): string {
  const dueBlock = dueCards.length
    ? `<h2 style="font-size:15px">Line items due within ${withinDays} day(s)</h2>${dueCards.map(poCard).join("")}`
    : "";
  const nagBlock = nagCards.length
    ? `<h2 style="font-size:15px">Complete POs ready to receive into Shopify</h2>${nagCards.map(poCard).join("")}`
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
          shopifyVariantId: true,
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

  // Per-PO enrichment for the owner email: the collections its items belong to
  // (variant → collection titles, skipping the catch-all "All Products"), and an
  // Open PO deep link. Vendor comes straight off the PO/alert line.
  const baseUrl = portalBaseUrl();
  const catalogGroups = await getCatalogGroupsCached().catch(() => []);
  const collectionsByVariant = new Map<string, Set<string>>();
  for (const g of catalogGroups) {
    if (g.title.trim().toLowerCase() === "all products") continue;
    for (const vid of g.variantIds) {
      let s = collectionsByVariant.get(vid);
      if (!s) collectionsByVariant.set(vid, (s = new Set()));
      s.add(g.title);
    }
  }
  const poById = new Map(pos.map((po) => [po.id, po]));
  const collectionsForPo = (poId: string): string => {
    const po = poById.get(poId);
    if (!po) return "—";
    const titles = new Set<string>();
    for (const item of po.lineItems) {
      const s = item.shopifyVariantId ? collectionsByVariant.get(item.shopifyVariantId) : null;
      if (s) for (const t of s) titles.add(t);
    }
    return titles.size ? [...titles].sort().join(", ") : "—";
  };

  // Group due line items by PO; build one card per PO (vendor + collections +
  // Open PO + its due lines). Nags get a card too (no line list).
  const dueByPo = new Map<string, OwnerPoCard>();
  for (const d of due) {
    let card = dueByPo.get(d.poId);
    if (!card) {
      card = {
        poNumber: d.poNumber,
        supplierName: d.supplierName,
        collections: collectionsForPo(d.poId),
        openUrl: `${baseUrl}/modules/production/po/${d.poId}`,
        lines: [],
      };
      dueByPo.set(d.poId, card);
    }
    card.lines.push(d);
  }
  const dueCards = [...dueByPo.values()];
  const nagCards: OwnerPoCard[] = nags.map((n) => ({
    poNumber: n.poNumber,
    supplierName: poById.get(n.id)?.supplier?.name ?? "—",
    collections: collectionsForPo(n.id),
    openUrl: `${baseUrl}/modules/production/po/${n.id}`,
    lines: [],
  }));

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
          html: ownerHtml(dueCards, nagCards, withinDays),
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
