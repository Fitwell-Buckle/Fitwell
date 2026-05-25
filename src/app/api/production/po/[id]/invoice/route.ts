import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { productionPoLineItem } from "@/lib/schema";
import { getShopifyClient } from "@/lib/shopify/client";
import { createInvoiceFromPo } from "@/lib/invoicing/service";

// Create invoice(s) from a PO — one per bill-to company. Retail unit prices are
// resolved from Shopify here (best-effort; missing/blocked lookups fall back to
// 0 and can be edited on the draft invoice). Admin-only.
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

  // Distinct variant ids on this PO → resolve retail prices once each.
  const lines = await db
    .select({ shopifyVariantId: productionPoLineItem.shopifyVariantId })
    .from(productionPoLineItem)
    .where(eq(productionPoLineItem.poId, id));
  const variantIds = [
    ...new Set(lines.map((l) => l.shopifyVariantId).filter((v): v is string => !!v)),
  ];

  const retailByVariant = new Map<string, number>();
  const client = getShopifyClient();
  for (const v of variantIds) {
    try {
      retailByVariant.set(v, await client.getVariantPriceCents(v));
    } catch (err) {
      // Leave it out → priced at 0, editable on the draft invoice.
      console.error(`Retail lookup failed for variant ${v}:`, err);
    }
  }

  try {
    const result = await createInvoiceFromPo(id, retailByVariant);
    if (result.invoices.length === 0) {
      return NextResponse.json(
        {
          error:
            "No bill-to brand on this PO. Set a brand on the PO (or its line items) first.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message.includes("not found")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("Create invoice from PO failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
