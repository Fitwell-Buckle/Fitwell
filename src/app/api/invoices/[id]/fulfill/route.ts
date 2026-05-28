import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markInvoiceFulfilled } from "@/lib/invoicing/service";
import { getBillingSettings } from "@/lib/invoicing/billing-settings";
import { buildBalanceEmailHtml } from "@/lib/invoicing/email";
import { sendEmail } from "@/lib/email/resend";

/**
 * Mark a B2B invoice fulfilled. When a deposit was taken, this also creates a
 * Shopify draft order for the remaining balance and emails the customer the
 * balance payment link. Service degrades gracefully if the Shopify scope is
 * missing — still stamps the invoice fulfilled, just skips the balance draft
 * (and therefore the email). Admin-only.
 */
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
  const result = await markInvoiceFulfilled(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Email the balance link to the customer. Mirrors the send-route pattern:
  // log to console when RESEND_API_KEY is missing (dev) and never let an email
  // failure mask the fact that the invoice was actually fulfilled.
  const notes: string[] = [result.note];
  if (result.balancePayUrl && result.contactEmail) {
    const billing = await getBillingSettings();
    const subject = `Balance due for invoice ${result.invoiceNumber}`;
    const html = buildBalanceEmailHtml({
      invoiceNumber: result.invoiceNumber,
      companyName: result.companyName ?? "—",
      balanceCents: result.balanceCents,
      payUrl: result.balancePayUrl,
      instructions: billing?.instructions ?? null,
    });
    if (!process.env.RESEND_API_KEY) {
      console.log(
        `\n──────────────────────────────────────────────\n` +
          `Balance due for invoice ${result.invoiceNumber} → ${result.contactEmail}\n` +
          `Pay link: ${result.balancePayUrl}\n` +
          `(RESEND_API_KEY not set — email logged for local dev)\n` +
          `──────────────────────────────────────────────\n`,
      );
      notes.push("balance email logged to console (RESEND_API_KEY not set)");
    } else {
      try {
        await sendEmail({
          to: result.contactEmail,
          subject,
          html,
          cc: session.user.email ?? undefined,
        });
        notes.push(`emailed balance link to ${result.contactEmail}`);
      } catch (err) {
        console.error("Balance email failed:", err);
        notes.push("balance email failed (link still on invoice page)");
      }
    }
  } else if (result.balancePayUrl && !result.contactEmail) {
    notes.push("no contact email on file — balance link not emailed");
  }

  return NextResponse.json({
    data: { balancePayUrl: result.balancePayUrl },
    message: notes.join("; ") + ".",
  });
}
