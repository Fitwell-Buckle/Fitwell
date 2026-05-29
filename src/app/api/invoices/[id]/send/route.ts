import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invoice } from "@/lib/schema";
import {
  getInvoiceDetail,
  updateInvoiceStatus,
  snapshotInvoiceDeposit,
} from "@/lib/invoicing/service";
import { computeDeposit } from "@/lib/invoicing/invoicing";
import { buildInvoiceEmailHtml } from "@/lib/invoicing/email";
import { getBillingSettings } from "@/lib/invoicing/billing-settings";
import { sendEmail } from "@/lib/email/resend";
import { getShopifyClient } from "@/lib/shopify/client";

function isScopeError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("write_draft_orders") || m.includes("access denied") || m.includes("403");
}

// Optional body — recipients + a custom message from the Print & Send preview.
const bodySchema = z
  .object({
    to: z.string().email().optional(),
    additional: z.array(z.string().email()).max(20).optional(),
    message: z.string().max(5000).nullish(),
  })
  .partial();

// Send an invoice to its company: email the document (Resend) and — for the
// hybrid flow — push a Shopify draft order with a payment link when the company
// is linked to a Shopify customer. Marks the invoice "sent". Admin-only.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof bodySchema> = {};
  try {
    body = bodySchema.parse(await req.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ error: "Invalid recipient email." }, { status: 400 });
  }

  const { id } = await params;
  const inv = await getInvoiceDetail(id);
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (inv.status === "void") {
    return NextResponse.json({ error: "Can't send a void invoice." }, { status: 409 });
  }

  // Recipients: the editable "To" from the preview (falls back to the brand's
  // contact email) plus any additional addresses.
  const primary = body.to ?? inv.company?.contactEmail ?? null;
  const recipients = primary ? [primary, ...(body.additional ?? [])] : [];
  const message = body.message ?? null;
  const shopifyCustomerId = inv.company?.customer?.shopifyId ?? null;
  const notes: string[] = [];

  // Deposit terms (snapshot from the brand). When a deposit applies, the
  // payment link bills only the deposit now; the balance is billed at fulfillment.
  // Deposit %: invoice override wins, otherwise the brand's default. Lets an
  // admin set a one-off deposit for a specific invoice (0% to waive, or a
  // higher % for risk) without changing the brand's default.
  const depositPercent =
    inv.depositPercent ?? inv.company?.depositPercent ?? 0;
  const split = computeDeposit(inv.totalCents, depositPercent);
  const hasDeposit = split.depositCents > 0 && split.balanceCents > 0;
  if (depositPercent > 0) {
    await snapshotInvoiceDeposit(id, depositPercent, inv.totalCents);
  }
  const depositNote = hasDeposit
    ? `A ${depositPercent}% deposit ($${(split.depositCents / 100).toFixed(2)}) is due now via the payment link below. The remaining balance ($${(split.balanceCents / 100).toFixed(2)}) will be billed when your order is fulfilled.`
    : null;
  const emailMessage = [depositNote, message].filter(Boolean).join("\n\n") || null;

  // 1) Shopify draft order — the payment link. Required for Shopify-linked
  // companies: if it can't be created we abort the send below (block) rather
  // than email a linkless invoice or mark it "sent".
  let payUrl: string | null = inv.shopifyInvoiceUrl ?? null;
  let pushedShopify = false;
  if (shopifyCustomerId) {
    try {
      const r = await getShopifyClient().createDraftOrderInvoice({
        email: primary,
        shopifyCustomerId,
        discountPercent: hasDeposit ? 0 : inv.discountPercent ?? 0,
        note: hasDeposit
          ? `Deposit (${depositPercent}%) for invoice ${inv.invoiceNumber}`
          : `Invoice ${inv.invoiceNumber}`,
        lines: hasDeposit
          ? [
              {
                variantId: null,
                title: `Deposit (${depositPercent}%) — ${inv.invoiceNumber}`,
                quantity: 1,
                unitPriceCents: split.depositCents,
              },
            ]
          : inv.lineItems.map((l) => ({
              variantId: l.shopifyVariantId,
              title: l.title,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
            })),
      });
      payUrl = r.invoiceUrl ?? payUrl;
      pushedShopify = true;
      await db
        .update(invoice)
        .set({
          shopifyDraftOrderId: r.draftOrderId,
          shopifyInvoiceUrl: r.invoiceUrl,
          updatedAt: new Date(),
        })
        .where(eq(invoice.id, id));
      notes.push(
        hasDeposit
          ? `created a Shopify deposit link (${depositPercent}%)`
          : "created a Shopify payment link",
      );
    } catch (err) {
      // Block the send: a Shopify-linked company expects a payable invoice, so
      // if the payment link can't be created we don't email or mark it sent.
      const message = err instanceof Error ? err.message : "";
      const scope = isScopeError(message);
      console.error("Invoice draft order failed:", err);
      return NextResponse.json(
        {
          error: scope
            ? "Couldn't create the Shopify payment link — the app is missing the write_draft_orders scope. Grant it (deploy + re-authorize the app), then send again. The invoice was not sent."
            : "Couldn't create the Shopify payment link — the Shopify draft order failed. The invoice was not sent.",
        },
        { status: scope ? 409 : 502 },
      );
    }
  }

  // 2) Email the invoice document (with the optional custom message + pay link).
  if (recipients.length === 0) {
    notes.push("no brand email on file — not emailed");
  } else {
    const billing = await getBillingSettings();
    const subject = `Invoice ${inv.invoiceNumber} from Fitwell Buckle Co.`;
    const html = buildInvoiceEmailHtml({
      invoiceNumber: inv.invoiceNumber,
      companyName: inv.company?.name ?? "—",
      issuedDate: inv.issuedDate,
      dueDate: inv.dueDate,
      discountPercent: inv.discountPercent,
      totalCents: inv.totalCents,
      notes: inv.notes,
      lineItems: inv.lineItems.map((l) => ({
        sku: l.sku,
        title: l.title,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
      })),
      payUrl,
      instructions: billing?.instructions ?? null,
      message: emailMessage,
    });

    if (!process.env.RESEND_API_KEY) {
      // Mirror the supplier magic-link helper: log instead of failing in dev.
      console.log(
        `\n──────────────────────────────────────────────\n` +
          `Invoice ${inv.invoiceNumber} for ${recipients.join(", ")}` +
          (payUrl ? `\nPay link: ${payUrl}` : "") +
          (emailMessage ? `\nMessage: ${emailMessage}` : "") +
          `\n(RESEND_API_KEY not set — email logged for local dev)\n` +
          `──────────────────────────────────────────────\n`,
      );
      notes.push("email logged to console (RESEND_API_KEY not set)");
    } else {
      try {
        await sendEmail({
          to: recipients,
          subject,
          html,
          cc: session.user.email ?? undefined,
        });
        notes.push(`emailed ${recipients.join(", ")}`);
      } catch (err) {
        console.error("Invoice email failed:", err);
        notes.push("email failed");
      }
    }
  }

  await updateInvoiceStatus(id, "sent");

  return NextResponse.json({
    data: { emailedTo: recipients, pushedShopify, payUrl },
    message: notes.length ? `Marked sent — ${notes.join("; ")}.` : "Marked sent.",
  });
}
