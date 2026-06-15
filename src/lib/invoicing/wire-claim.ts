import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoice, company } from "@/lib/schema";
import { notifyB2bWireClaim } from "./order-notifications";

// Phrases a B2B buyer uses when they email to say they've paid by bank wire.
// Bare "wire" is intentionally excluded (matches "wireless" etc.); these are
// payment-specific. Matched against the email subject + Gmail snippet.
const WIRE_CLAIM_TERMS = [
  "wired",
  "wire transfer",
  "wire payment",
  "bank transfer",
  "transferred the",
  "transfer the funds",
  "sent the payment",
  "sent payment",
  "payment sent",
  "payment has been sent",
  "made the payment",
  "paid the invoice",
  "paid your invoice",
  "remittance",
  "remitted",
  "funds have been sent",
];

/** Heuristic: does this inbound email read like a bank-wire payment claim? */
export function looksLikeWireClaim(
  subject: string | null,
  snippet: string | null,
): boolean {
  const text = `${subject ?? ""} ${snippet ?? ""}`.toLowerCase();
  return WIRE_CLAIM_TERMS.some((t) => text.includes(t));
}

/**
 * A B2B customer emailed something that reads like a wire-payment claim. Fire
 * the "verify the wire" alert ONLY when the company has an open wire-method
 * order (status `sent`, paymentMethod `wire`) — links straight to it when
 * there's exactly one, else to the company. Never marks anything paid.
 */
export async function maybeNotifyWireClaim(
  companyId: string,
  fromEmail: string,
): Promise<void> {
  const open = await db.query.invoice.findMany({
    where: and(
      eq(invoice.companyId, companyId),
      eq(invoice.status, "sent"),
      eq(invoice.paymentMethod, "wire"),
    ),
    columns: { id: true, invoiceNumber: true },
    orderBy: desc(invoice.createdAt),
  });
  if (open.length === 0) return; // no outstanding wire order → don't flag

  const comp = await db.query.company.findFirst({
    where: eq(company.id, companyId),
    columns: { name: true },
  });
  const single = open.length === 1 ? open[0] : undefined;
  await notifyB2bWireClaim({
    companyId,
    companyName: comp?.name ?? "—",
    invoiceId: single?.id,
    invoiceNumber: single?.invoiceNumber,
    fromEmail,
  });
}
