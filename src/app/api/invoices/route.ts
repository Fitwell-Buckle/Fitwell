import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createInvoice, createInvoiceSchema, invoiceLineInputSchema } from "@/lib/invoicing/service";
import { resolveOrderShipTos } from "@/lib/portal/addresses";

// The form sends saved-address ids (order-level + per-line); the route resolves
// them to stable ship-to snapshots before creating the invoice.
const createBodySchema = createInvoiceSchema.extend({
  addressId: z.string().nullish(),
  lineItems: z
    .array(invoiceLineInputSchema.extend({ addressId: z.string().nullish() }))
    .min(1, "an invoice needs at least one line"),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "supplier") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = createBodySchema.parse(await req.json());
  } catch (err) {
    // Surface the first validation message (e.g. the missing-SKU one) instead
    // of a generic "Invalid payload" so the form tells the user what to fix.
    return NextResponse.json(
      {
        error:
          err instanceof z.ZodError
            ? (err.issues[0]?.message ?? "Invalid payload")
            : "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  const { addressId, lineItems, ...rest } = body;
  const { orderShipTo, lineShipTos } = await resolveOrderShipTos(
    body.companyId,
    addressId ?? undefined,
    lineItems.map((l) => l.addressId ?? undefined),
  );

  try {
    const result = await createInvoice({
      ...rest,
      shipTo: orderShipTo ?? null,
      lineItems: lineItems.map((l, i) => ({
        sku: l.sku,
        title: l.title,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        shopifyProductId: l.shopifyProductId,
        shopifyVariantId: l.shopifyVariantId,
        shipTo: lineShipTos[i],
      })),
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message.includes("already exists for this PO")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("Create invoice failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
