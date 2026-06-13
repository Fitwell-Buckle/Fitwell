import { NextResponse } from "next/server";
import { z } from "zod";
import { getCompanyScope } from "@/lib/portal/company-session";
import { resolveOrderShipTos } from "@/lib/portal/addresses";
import { savePortalOrderLines, submitPortalOrder } from "@/lib/invoicing/portal-orders";

const schema = z.object({
  lineItems: z
    .array(
      z.object({
        shopifyVariantId: z.string().min(1),
        quantity: z.number().int().positive(),
        // Per-line split-fulfillment address ("" / omitted = order's primary).
        addressId: z.string().optional(),
      }),
    )
    .min(1, "Your order is empty."),
  // Omitted on a draft = save changes (still a draft). Set = submit for payment.
  // On an already-submitted (sent) order, saving always regenerates the pay
  // link with its existing method even if `submit` is omitted.
  submit: z.enum(["card", "wire"]).optional(),
  // The order's primary saved-address id ("" = none). Resolved to a snapshot.
  addressId: z.string().optional(),
});

// Edit a B2B portal order the buyer owns. Allowed while draft or sent (unpaid);
// rejected once paid/void. Editing a sent order regenerates its Shopify pay link.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await getCompanyScope();
  if (!scope) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  const { orderShipTo, lineShipTos } = await resolveOrderShipTos(
    scope.companyId,
    input.addressId,
    input.lineItems.map((l) => l.addressId),
  );
  const lines = input.lineItems.map((l, i) => ({
    shopifyVariantId: l.shopifyVariantId,
    quantity: l.quantity,
    shipTo: lineShipTos[i],
  }));

  const saved = await savePortalOrderLines(scope, id, lines, orderShipTo);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });

  // Submit when asked, OR implicitly when editing an already-sent order (its
  // live pay link must be regenerated to match the new total).
  const submitMethod = input.submit ?? (saved.status === "sent" ? saved.paymentMethod : null);
  if (!submitMethod) {
    return NextResponse.json({ data: { invoiceId: id, status: "draft" } });
  }

  const sub = await submitPortalOrder(scope, id, submitMethod);
  if (!sub.ok) return NextResponse.json({ error: sub.error }, { status: sub.status });
  return NextResponse.json({ data: { ...sub, status: "sent" } });
}
