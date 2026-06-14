import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { influencerOrder } from "@/lib/schema";
import {
  getInfluencerOrderDetail,
  buildGiftDraftOrder,
} from "@/lib/influencer/service";
import { buildGiftEmailHtml } from "@/lib/invoicing/email";
import { sendEmail } from "@/lib/email/resend";

export const runtime = "nodejs";

function isScopeError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("write_draft_orders") || m.includes("access denied") || m.includes("403");
}

// Send a gifting order to its influencer: push a Shopify draft order at 100% off
// (with split-fulfillment "Ship to" attributes when the lines carry per-line
// addresses) and email the gift confirmation (Resend). Marks the order "sent".
// No payment/deposit/wire — gifting is free. Admin-only.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier" || session.user.role === "company") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const order = await getInfluencerOrderDetail(id);
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.status === "cancelled") {
    return NextResponse.json({ error: "Can't send a cancelled order." }, { status: 409 });
  }

  const email = order.influencer?.contactEmail ?? null;
  const shopifyCustomerId = order.influencer?.customer?.shopifyId ?? null;
  const notes: string[] = [];

  // 1) Shopify gifting draft order (the fulfillment record). Required when the
  // influencer is linked to a Shopify customer: if it can't be created we block
  // rather than mark the order sent with no draft behind it.
  let payUrl: string | null = order.shopifyInvoiceUrl ?? null;
  let pushedShopify = false;
  if (shopifyCustomerId) {
    try {
      const draft = await buildGiftDraftOrder({
        email,
        shopifyCustomerId,
        influencerName: order.influencer?.name ?? "—",
        lineItems: order.lineItems.map((l) => ({
          sku: l.sku,
          title: l.title,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          shopifyVariantId: l.shopifyVariantId,
          shipTo: l.shipTo,
        })),
        shipTo: order.shipTo ?? null,
      });
      payUrl = draft.invoiceUrl ?? payUrl;
      pushedShopify = true;
      await db
        .update(influencerOrder)
        .set({
          shopifyDraftOrderId: draft.draftOrderId,
          shopifyInvoiceUrl: draft.invoiceUrl,
          updatedAt: new Date(),
        })
        .where(eq(influencerOrder.id, id));
      notes.push("created a Shopify gifting draft order");
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      const scope = isScopeError(message);
      console.error("Influencer gift draft order failed:", err);
      return NextResponse.json(
        {
          error: scope
            ? "Couldn't create the Shopify gifting draft order — the app is missing the write_draft_orders scope. Grant it (deploy + re-authorize the app), then send again. The order was not sent."
            : "Couldn't create the Shopify gifting draft order. The order was not sent.",
        },
        { status: scope ? 409 : 502 },
      );
    }
  }

  // 2) Email the gift confirmation (line items at gift value, deadline + link).
  if (!email) {
    notes.push("no influencer email on file — not emailed");
  } else {
    const subject = `Your gift from Fitwell Buckle Co. (${order.orderNumber})`;
    const html = buildGiftEmailHtml({
      orderNumber: order.orderNumber,
      influencerName: order.influencer?.name ?? "—",
      issuedDate: order.issuedDate,
      contentDueDate: order.contentDueDate,
      affiliateLink: order.affiliateLink,
      subtotalCents: order.subtotalCents,
      notes: order.notes,
      lineItems: order.lineItems.map((l) => ({
        sku: l.sku,
        title: l.title,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
      })),
    });

    if (!process.env.RESEND_API_KEY) {
      console.log(
        `\n──────────────────────────────────────────────\n` +
          `Gifting order ${order.orderNumber} for ${email}` +
          `\n(RESEND_API_KEY not set — email logged for local dev)\n` +
          `──────────────────────────────────────────────\n`,
      );
      notes.push("email logged to console (RESEND_API_KEY not set)");
    } else {
      try {
        await sendEmail({ to: [email], subject, html });
        notes.push(`emailed ${email}`);
      } catch (err) {
        console.error("Gift email failed:", err);
        notes.push("email failed");
      }
    }
  }

  await db
    .update(influencerOrder)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(eq(influencerOrder.id, id));

  return NextResponse.json({
    data: { emailedTo: email ? [email] : [], pushedShopify, payUrl },
    message: notes.length ? `Marked sent — ${notes.join("; ")}.` : "Marked sent.",
  });
}
