import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invoice } from "@/lib/schema";
import { getInvoiceDetail, updateInvoiceStatus } from "@/lib/invoicing/service";
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

  // 1) Optional Shopify draft order (gives a payment link we can include).
  let payUrl: string | null = inv.shopifyInvoiceUrl ?? null;
  let pushedShopify = false;
  if (shopifyCustomerId) {
    try {
      const r = await getShopifyClient().createDraftOrderInvoice({
        email: primary,
        shopifyCustomerId,
        discountPercent: inv.discountPercent ?? 0,
        note: `Invoice ${inv.invoiceNumber}`,
        lines: inv.lineItems.map((l) => ({
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
      notes.push("created a Shopify payment link");
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      notes.push(
        isScopeError(message)
          ? "Shopify draft order skipped — grant write_draft_orders and re-authorize"
          : "Shopify draft order failed",
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
      subtotalCents: inv.subtotalCents,
      discountPercent: inv.discountPercent,
      discountCents: inv.discountCents,
      totalCents: inv.totalCents,
      notes: inv.notes,
      lineItems: inv.lineItems.map((l) => ({
        sku: l.sku,
        title: l.title,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
      })),
      payUrl,
      remittance: billing,
      message,
    });

    if (!process.env.RESEND_API_KEY) {
      // Mirror the supplier magic-link helper: log instead of failing in dev.
      console.log(
        `\n──────────────────────────────────────────────\n` +
          `Invoice ${inv.invoiceNumber} for ${recipients.join(", ")}` +
          (payUrl ? `\nPay link: ${payUrl}` : "") +
          (message ? `\nMessage: ${message}` : "") +
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
