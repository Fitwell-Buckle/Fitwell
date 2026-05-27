import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getPoDetail, getSupplierLineCosts } from "@/lib/production/service";
import { getCatalogCached, makeLineAttrs } from "@/lib/catalog/load";
import { fmtMoney, fmtDate, STATUS_LABELS } from "@/lib/production/display";
import { type ProductionStage } from "@/lib/production/stages";
import { getStageLabels, getStageOrder, type StageLabels } from "@/lib/production/stage-labels";
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
  supplierUnit: Map<string, number | null>,
  stageLabels: StageLabels,
  order: readonly string[],
): string {
  const cell = "padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;";
  const th = "padding:6px 10px;border-bottom:2px solid #ddd;font-size:11px;text-transform:uppercase;color:#888;text-align:left;";
  const prefixHtml = stagePrefix
    ? `<span style="color:#dc2626;font-weight:600;">${esc(stagePrefix)} — </span>`
    : "";
  // A sub-PO shows what we pay THIS supplier, per line. Costs live on the master
  // (keyed by supplier + line) and are passed in as a per-line lookup.
  const isSubPo = !!po.parentPoId;
  const supplierTotal = items.reduce(
    (s, li) => s + (supplierUnit.get(li.id) ?? 0) * li.quantity,
    0,
  );

  let tableHtml: string;
  if (rawBlanks.length > 0) {
    // Raw-blank summary (pre-polishing supplier): grouped by size + material.
    const rows = rawBlanks
      .map((g) => {
        const unit = g.lineItemIds.length ? supplierUnit.get(g.lineItemIds[0]) ?? null : null;
        const ext = unit != null ? unit * g.quantity : null;
        return `<tr>
        <td style="${cell}">${prefixHtml}<strong>${esc(g.label)}</strong></td>
        <td style="${cell}color:#888;font-size:11px;">${esc(g.skus.join(", "))}</td>
        <td style="${cell}text-align:right;font-weight:bold;">${g.quantity}</td>
        <td style="${cell}text-align:right;">${fmtMoney(ext)}</td>
      </tr>`;
      })
      .join("");
    const totalPieces = rawBlanks.reduce((s, g) => s + g.quantity, 0);
    tableHtml = `<p style="font-size:12px;color:#666;margin:0 0 8px;">Raw blanks to produce — grouped by size + material (colour/finish is added downstream):</p>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="${th}">Raw blank</th>
        <th style="${th}">Covers (finished SKUs)</th>
        <th style="${th}text-align:right;">Qty</th>
        <th style="${th}text-align:right;">Supplier price</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="2" style="${cell}text-align:right;font-weight:bold;">Total pieces</td>
        <td style="${cell}text-align:right;font-weight:bold;">${totalPieces}</td>
        <td style="${cell}text-align:right;font-weight:bold;">${supplierTotal > 0 ? fmtMoney(supplierTotal) : ""}</td>
      </tr></tfoot>
    </table>`;
  } else if (isSubPo) {
    const rows = items
      .map((li) => {
        const unit = supplierUnit.get(li.id) ?? null;
        const ext = unit != null ? unit * li.quantity : null;
        return `<tr>
        <td style="${cell}font-family:monospace;">${esc(li.sku)}</td>
        <td style="${cell}">${prefixHtml}${esc(li.title)}</td>
        <td style="${cell}text-align:right;">${li.quantity}</td>
        <td style="${cell}text-align:right;">${fmtMoney(ext)}</td>
      </tr>`;
      })
      .join("");
    tableHtml = `<table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="${th}">SKU</th><th style="${th}">Product</th>
        <th style="${th}text-align:right;">Qty</th>
        <th style="${th}text-align:right;">Supplier price</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="3" style="${cell}text-align:right;font-weight:bold;">Supplier total</td>
        <td style="${cell}text-align:right;font-weight:bold;">${fmtMoney(supplierTotal)}</td>
      </tr></tfoot>
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
        <td colspan="4" style="${cell}text-align:right;font-weight:bold;">Total</td>
        <td style="${cell}text-align:right;font-weight:bold;">${fmtMoney(total)}</td>
      </tr></tfoot>
    </table>`;
  }

  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:680px;">
    <h2 style="margin:0 0 4px;">Purchase Order ${esc(numberDisplay)}</h2>
    <p style="margin:0 0 16px;color:#666;font-size:13px;">Fitwell Buckle Co.</p>
    <table style="font-size:13px;color:#333;margin-bottom:16px;">
      <tr><td style="padding:2px 16px 2px 0;color:#888;">Supplier</td><td>${esc(po.supplier?.name ?? "—")}</td></tr>
      <tr><td style="padding:2px 16px 2px 0;color:#888;">Customer</td><td>${esc(po.company?.name ?? "—")}</td></tr>
      <tr><td style="padding:2px 16px 2px 0;color:#888;">Status</td><td>${esc(STATUS_LABELS[po.status as keyof typeof STATUS_LABELS] ?? po.status)}</td></tr>
      <tr><td style="padding:2px 16px 2px 0;color:#888;">Issued</td><td>${esc(fmtDate(po.issuedDate))}</td></tr>
      <tr><td style="padding:2px 16px 2px 0;color:#888;">ETA</td><td>${esc(fmtDate(po.expectedDeliveryDate))}</td></tr>
    </table>
    ${tableHtml}
    ${po.notes ? `<p style="margin-top:16px;font-size:13px;color:#444;">${esc(po.notes)}</p>` : ""}
    <p style="margin-top:20px;font-size:11px;color:#aaa;">Stages: ${order.slice(0, -1).map((s) => stageLabels[s]).join(" → ")}</p>
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
  const stageLabels = await getStageLabels();
  const order = await getStageOrder();

  // A sub-PO carries no line items of its own — bill the master's items, and
  // flag the stages this supplier is responsible for (red, per line).
  const master = po.parentPoId ? await getPoDetail(po.parentPoId) : null;
  const items = (master ?? po).lineItems;
  const numberDisplay = formatPoNumber(po.shopifyPoNumber, { suffix: po.poSuffix });
  let stageKeys: ProductionStage[] = [];
  if (master) {
    const plan = planSubPos(
      order,
      order.slice(0, -1),
      master.stageAssignments,
      master.supplierId,
    );
    stageKeys = plan.find((p) => p.supplierId === po.supplierId)?.stages ?? [];
  }
  const stagePrefix = stageKeys
    .filter((s) => s !== order[0])
    .map((s) => stageLabels[s])
    .join(", ");

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
          lineItemId: li.id,
        })),
      );
    } catch {
      /* catalog unavailable — fall back to per-SKU lines */
    }
  }

  // Sub-PO: what we pay this supplier, per line (costs live on the master).
  const supplierUnit = new Map<string, number | null>();
  if (po.parentPoId) {
    const costs = await getSupplierLineCosts((master ?? po).id);
    for (const c of costs) {
      if (c.supplierId === po.supplierId) supplierUnit.set(c.lineItemId, c.unitCostCents);
    }
  }

  const to = [input.to, ...(input.additional ?? [])];
  const cc = session.user.email ?? undefined; // CC the logged-in user

  try {
    await sendEmail({
      to,
      cc,
      subject: `Purchase Order ${numberDisplay} — Fitwell Buckle Co.`,
      html: buildPoEmailHtml(po, items, numberDisplay, stagePrefix, rawBlanks, supplierUnit, stageLabels, order),
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
