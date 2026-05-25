import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { company } from "@/lib/schema";
import { getCompanyScope } from "@/lib/portal/company-session";
import { getCatalogCached } from "@/lib/catalog/load";
import { getShopifyClient } from "@/lib/shopify/client";
import { recordCompanyOrder } from "@/lib/invoicing/service";

const schema = z.object({
  lineItems: z
    .array(
      z.object({
        shopifyVariantId: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, "Your cart is empty."),
});

function isScopeError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("write_draft_orders") || m.includes("access denied") || m.includes("403");
}

// Instant self-checkout for a logged-in company: creates a Shopify draft order
// at the company's tier discount (paid via Shopify checkout) and records the
// order as an invoice. Company-scoped.
export async function POST(req: Request) {
  const scope = await getCompanyScope();
  if (!scope) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  const comp = await db.query.company.findFirst({
    where: eq(company.id, scope.companyId),
    columns: { id: true, name: true, contactEmail: true },
    with: {
      priceTier: { columns: { discountPercent: true } },
      customer: { columns: { shopifyId: true } },
    },
  });
  if (!comp) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  // Resolve each cart variant against the catalog (price, sku, title).
  let catalog;
  try {
    catalog = await getCatalogCached();
  } catch {
    return NextResponse.json(
      { error: "Catalog is unavailable right now — please try again." },
      { status: 502 },
    );
  }
  const byVariant = new Map(catalog.map((v) => [v.shopifyVariantId, v]));

  const lines = [];
  for (const li of input.lineItems) {
    const v = byVariant.get(li.shopifyVariantId);
    if (!v) {
      return NextResponse.json(
        { error: "One or more items are no longer available." },
        { status: 400 },
      );
    }
    lines.push({ v, quantity: li.quantity });
  }

  // 1) Shopify draft order (the payment checkout) at the company's tier.
  let draft;
  try {
    draft = await getShopifyClient().createDraftOrderInvoice({
      email: scope.email ?? comp.contactEmail ?? null,
      shopifyCustomerId: comp.customer?.shopifyId ?? null,
      discountPercent: comp.priceTier?.discountPercent ?? 0,
      note: `Portal order — ${comp.name}`,
      lines: lines.map(({ v, quantity }) => ({
        variantId: v.shopifyVariantId,
        title: v.variantTitle ? `${v.title} — ${v.variantTitle}` : v.title,
        quantity,
        unitPriceCents: v.priceCents,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (isScopeError(message)) {
      return NextResponse.json(
        {
          error:
            "Online checkout isn't enabled yet. Please contact Fitwell to complete this order.",
        },
        { status: 503 },
      );
    }
    console.error("Portal checkout draft order failed:", err);
    return NextResponse.json({ error: "Checkout failed — please try again." }, { status: 502 });
  }

  // 2) Record the order as an invoice (tier snapshot) + the payment link.
  const order = await recordCompanyOrder({
    companyId: scope.companyId,
    lineItems: lines.map(({ v, quantity }) => ({
      sku: v.sku,
      title: v.variantTitle ? `${v.title} — ${v.variantTitle}` : v.title,
      quantity,
      unitPriceCents: v.priceCents,
      shopifyProductId: v.shopifyProductId,
      shopifyVariantId: v.shopifyVariantId,
    })),
    shopifyDraftOrderId: draft.draftOrderId,
    shopifyInvoiceUrl: draft.invoiceUrl,
  });

  return NextResponse.json(
    { data: { invoiceId: order.id, invoiceNumber: order.invoiceNumber, payUrl: draft.invoiceUrl } },
    { status: 201 },
  );
}
