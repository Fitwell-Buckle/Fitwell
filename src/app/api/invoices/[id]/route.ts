import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invoice } from "@/lib/schema";
import {
  updateInvoice,
  updateInvoiceStatus,
  updateInvoiceSchema,
  invoiceLineInputSchema,
} from "@/lib/invoicing/service";
import { resolveOrderShipTos } from "@/lib/portal/addresses";
import { INVOICE_STATUSES, type InvoiceStatus } from "@/lib/invoicing/invoicing";

const statusSchema = z.object({ status: z.enum(INVOICE_STATUSES) });

// The form sends saved-address ids (order-level + per-line); resolved to ship-to
// snapshots against the invoice's company.
const updateBodySchema = updateInvoiceSchema.extend({
  addressId: z.string().nullish(),
  lineItems: z.array(invoiceLineInputSchema.extend({ addressId: z.string().nullish() })).min(1),
});

// PATCH = status change (draft → sent → paid / void).
export async function PATCH(
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

  const { id } = await params;
  let input;
  try {
    input = statusSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: err instanceof z.ZodError ? err.issues : undefined,
      },
      { status: 400 },
    );
  }

  const row = await updateInvoiceStatus(id, input.status as InvoiceStatus);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: { id: row.id, status: input.status } });
}

// PUT = full edit (header + line items, recompute totals).
export async function PUT(
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

  const { id } = await params;
  let body;
  try {
    body = updateBodySchema.parse(await req.json());
  } catch (err) {
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

  // Resolve the chosen addresses against the invoice's own company.
  const inv = await db.query.invoice.findFirst({
    where: eq(invoice.id, id),
    columns: { companyId: true },
  });
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { addressId, lineItems, ...rest } = body;
  const { orderShipTo, lineShipTos } = await resolveOrderShipTos(
    inv.companyId,
    addressId ?? undefined,
    lineItems.map((l) => l.addressId ?? undefined),
  );

  const result = await updateInvoice(id, {
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
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ data: { id } });
}

// Hard delete. Schema FKs cascade — invoice line items and invoice attachments
// are removed with the invoice. Admin-only. Any linked Shopify draft order
// (`shopifyDraftOrderId` / `shopifyBalanceDraftOrderId`) is NOT auto-revoked —
// handle those manually in Shopify if they exist.
export async function DELETE(
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
  try {
    const [deleted] = await db
      .delete(invoice)
      .where(eq(invoice.id, id))
      .returning({ id: invoice.id });
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id: deleted.id } });
  } catch (err) {
    console.error("Delete invoice failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
