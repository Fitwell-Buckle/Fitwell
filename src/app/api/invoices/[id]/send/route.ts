import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invoice } from "@/lib/schema";
import { getInvoiceDetail, updateInvoiceStatus } from "@/lib/invoicing/service";
import { buildInvoiceEmailHtml } from "@/lib/invoicing/email";
import { sendEmail } from "@/lib/email/resend";
import { getShopifyClient } from "@/lib/shopify/client";

function isScopeError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("write_draft_orders") || m.includes("access denied") || m.includes("403");
}

// Send an invoice to its company: email the document (Resend) and — for the
// hybrid flow — push a Shopify draft order with a payment link when the company
// is linked to a Shopify customer. Marks the invoice "sent". Admin-only.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const inv = await getInvoiceDetail(id);
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (inv.status === "void") {
    return NextResponse.json({ error: "Can't send a void invoice." }, { status: 409 });
  }

  const to = inv.company?.contactEmail ?? null;
  const shopifyCustomerId = inv.company?.customer?.shopifyId ?? null;
  const notes: string[] = [];

  // 1) Optional Shopify draft order (gives a payment link we can include).
  let payUrl: string | null = inv.shopifyInvoiceUrl ?? null;
  let pushedShopify = false;
  if (shopifyCustomerId) {
    try {
      const r = await getShopifyClient().createDraftOrderInvoice({
        email: to,
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

  // 2) Email the invoice document.
  if (!to) {
    notes.push("no company email on file — not emailed");
  } else if (!process.env.RESEND_API_KEY) {
    notes.push("email skipped (RESEND_API_KEY not set)");
  } else {
    try {
      await sendEmail({
        to,
        subject: `Invoice ${inv.invoiceNumber} from Fitwell Buckle Co.`,
        html: buildInvoiceEmailHtml({
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
        }),
        cc: session.user.email ?? undefined,
      });
      notes.push("emailed the company");
    } catch (err) {
      console.error("Invoice email failed:", err);
      notes.push("email failed");
    }
  }

  await updateInvoiceStatus(id, "sent");

  return NextResponse.json({
    data: { emailedTo: to, pushedShopify, payUrl },
    message: notes.length ? `Marked sent — ${notes.join("; ")}.` : "Marked sent.",
  });
}
