import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getPoDetail } from "@/lib/production/service";
import { getCatalogCached, makeLineAttrs } from "@/lib/catalog/load";
import { fmtMoney, fmtDate, STATUS_LABELS } from "@/lib/production/display";
import { STAGES, STAGE_LABELS, type ProductionStage } from "@/lib/production/stages";
import { formatPoNumber, planSubPos } from "@/lib/production/sub-po";
import {
  usesRawBlankSummary,
  summarizeRawBlanks,
  type RawBlankGroup,
} from "@/lib/production/raw-blank";
import { sendEmail } from "@/lib/email/resend";

const bodySchema = z.object({
  to: z.string().email(),
  additional: z.array(z.string().email()).max(20).optional(),
});

type Po = NonNullable<Awaited<ReturnType<typeof getPoDetail>>>;

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
}

function buildPoEmailHtml(
  po: Po,
  items: Po["lineItems"],
  numberDisplay: string,
  stagePrefix: string,
  rawBlanks: RawBlankGroup[],
): string {
  const cell = "padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;";
  const th = "padding:6px 10px;border-bottom:2px solid #ddd;font-size:11px;text-transform:uppercase;color:#888;text-align:left;";
  const prefixHtml = stagePrefix
    ? `<span style="color:#dc2626;font-weight:600;">${esc(stagePrefix)} — </span>`
    : "";
  // On a sub-PO, the meaningful total is what we pay this supplier.
  const supplierPrice = po.parentPoId ? po.supplierPriceCents ?? null : null;

  let tableHtml: string;
  if (rawBlanks.length > 0) {
    // Raw-blank summary (pre-polishing supplier): grouped by size + material.
    const rows = rawBlanks
      .map(
        (g) => `<tr>
        <td style="${cell}">${prefixHtml}<strong>${esc(g.label)}</strong></td>
        <td style="${cell}text-align:right;font-weight:bold;">${g.quantity}</td>
        <td style="${cell}color:#888;font-size:11px;">${esc(g.skus.join(", "))}</td>
      </tr>`,
      )
      .join("");
    const totalPieces = rawBlanks.reduce((s, g) => s + g.quantity, 0);
    tableHtml = `<p style="font-size:12px;color:#666;margin:0 0 8px;">Raw blanks to produce — grouped by size + material (colour/finish is added downstream):</p>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="${th}">Raw blank</th>
        <th style="${th}text-align:right;">Qty</th>
        <th style="${th}">Covers (finished SKUs)</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td style="${cell}text-align:right;font-weight:bold;">Total pieces</td>
        <td style="${cell}text-align:right;font-weight:bold;">${totalPieces}</td>
        <td style="${cell}"></td>
      </tr>${
        supplierPrice != null
          ? `<tr><td style="${cell}text-align:right;font-weight:bold;">Supplier price</td><td style="${cell}text-align:right;font-weight:bold;">${fmtMoney(supplierPrice)}</td><td style="${cell}"></td></tr>`
          : ""
      }</tfoot>
    </table>`;
  } else {
    const rows = items
      .map((li) => {
        const lineTotal = li.unitCostCents != null ? li.unitCostCents * li.quantity : null;
        return `<tr>
        <td style="${cell}font-family:monospace;">${esc(li.sku)}</td>
        <td style="${cell}">${prefixHtml}${esc(li.title)}</td>
        <td style="${cell}text-align:right;">${li.quantity}</td>
        <td style="${cell}text-align:right;">${fmtMoney(li.unitCostCents)}</td>
        <td style="${cell}text-align:right;">${fmtMoney(lineTotal)}</td>
      </tr>`;
      })
      .join("");
    const total = items.reduce((s, li) => s + (li.unitCostCents ?? 0) * li.quantity, 0);
    tableHtml = `<table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="${th}">SKU</th><th style="${th}">Product</th>
        <th style="${th}text-align:right;">Qty</th>
        <th style="${th}text-align:right;">Unit cost</th>
        <th style="${th}text-align:right;">Line total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="4" style="${cell}text-align:right;font-weight:bold;">${supplierPrice != null ? "Supplier price" : "Total"}</td>
        <td style="${cell}text-align:right;font-weight:bold;">${fmtMoney(supplierPrice != null ? supplierPrice : total)}</td>
      </tr></tfoot>
    </table>`;
  }

  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:680px;">
    <h2 style="margin:0 0 4px;">Purchase Order ${esc(numberDisplay)}</h2>
    <p style="margin:0 0 16px;color:#666;font-size:13px;">Fitwell Buckle Co.</p>
    <table style="font-size:13px;color:#333;margin-bottom:16px;">
      <tr><td style="padding:2px 16px 2px 0;color:#888;">Supplier</td><td>${esc(po.supplier?.name ?? "—")}</td></tr>
      <tr><td style="padding:2px 16px 2px 0;color:#888;">Brand</td><td>${esc(po.company?.name ?? "—")}</td></tr>
      <tr><td style="padding:2px 16px 2px 0;color:#888;">Status</td><td>${esc(STATUS_LABELS[po.status as keyof typeof STATUS_LABELS] ?? po.status)}</td></tr>
      <tr><td style="padding:2px 16px 2px 0;color:#888;">Issued</td><td>${esc(fmtDate(po.issuedDate))}</td></tr>
      <tr><td style="padding:2px 16px 2px 0;color:#888;">ETA</td><td>${esc(fmtDate(po.expectedDeliveryDate))}</td></tr>
    </table>
    ${tableHtml}
    ${po.notes ? `<p style="margin-top:16px;font-size:13px;color:#444;">${esc(po.notes)}</p>` : ""}
    <p style="margin-top:20px;font-size:11px;color:#aaa;">Stages: ${Object.values(STAGE_LABELS).slice(0, 8).join(" → ")}</p>
  </div>`;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let input;
  try {
    input = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  const po = await getPoDetail(id);
  if (!po) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // A sub-PO carries no line items of its own — bill the master's items, and
  // flag the stages this supplier is responsible for (red, per line).
  const master = po.parentPoId ? await getPoDetail(po.parentPoId) : null;
  const items = (master ?? po).lineItems;
  const numberDisplay = formatPoNumber(po.shopifyPoNumber, { suffix: po.poSuffix });
  let stageKeys: ProductionStage[] = [];
  if (master) {
    const plan = planSubPos(
      STAGES.filter((s) => s !== "complete"),
      master.stageAssignments,
      master.supplierId,
    );
    stageKeys = plan.find((p) => p.supplierId === po.supplierId)?.stages ?? [];
  }
  const stagePrefix = stageKeys.map((s) => STAGE_LABELS[s]).join(", ");

  // Pre-polishing supplier → summarize the email as raw blanks (size + material).
  let rawBlanks: RawBlankGroup[] = [];
  if (usesRawBlankSummary(stageKeys)) {
    try {
      const attrs = makeLineAttrs(await getCatalogCached());
      rawBlanks = summarizeRawBlanks(
        items.map((li) => ({
          sku: li.sku,
          quantity: li.quantity,
          sizeMm: attrs.sizeOf(li),
          material: attrs.materialOf(li),
        })),
      );
    } catch {
      /* catalog unavailable — fall back to per-SKU lines */
    }
  }

  const to = [input.to, ...(input.additional ?? [])];
  const cc = session.user.email ?? undefined; // CC the logged-in user

  try {
    await sendEmail({
      to,
      cc,
      subject: `Purchase Order ${numberDisplay} — Fitwell Buckle Co.`,
      html: buildPoEmailHtml(po, items, numberDisplay, stagePrefix, rawBlanks),
    });
    return NextResponse.json({ data: { sentTo: to, cc } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    if (message.includes("RESEND_API_KEY")) {
      return NextResponse.json(
        { error: "Email not configured — set RESEND_API_KEY." },
        { status: 503 },
      );
    }
    console.error("PO send failed:", err);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }
}
