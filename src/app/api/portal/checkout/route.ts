import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { company } from "@/lib/schema";
import { getCompanyScope } from "@/lib/portal/company-session";
import {
  getCatalogCached,
  getCatalogGroupsCached,
  allowedVariantIds,
  type CatalogCollectionGroup,
} from "@/lib/catalog/load";
import { getShopifyClient } from "@/lib/shopify/client";
import { recordCompanyOrder, snapshotInvoiceDeposit } from "@/lib/invoicing/service";
import { computeInvoiceTotals, computeDeposit } from "@/lib/invoicing/invoicing";

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
    columns: {
      id: true,
      name: true,
      contactEmail: true,
      assignedCollectionIds: true,
      assignedProductIds: true,
      depositPercent: true,
    },
    with: {
      priceTier: { columns: { discountPercent: true } },
      customer: { columns: { shopifyId: true } },
    },
  });
  if (!comp) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

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

  // Enforce this brand's catalog restriction (null = unrestricted). Defense in
  // depth — the portal already hides disallowed items.
  let groups: CatalogCollectionGroup[] = [];
  try {
    groups = await getCatalogGroupsCached();
  } catch {
    /* product-only enforcement if collections can't be resolved */
  }
  const allowed = allowedVariantIds({
    assignedCollectionIds: comp.assignedCollectionIds,
    assignedProductIds: comp.assignedProductIds,
    groups,
    catalog,
  });

  const lines = [];
  for (const li of input.lineItems) {
    const v = byVariant.get(li.shopifyVariantId);
    if (!v) {
      return NextResponse.json(
        { error: "One or more items are no longer available." },
        { status: 400 },
      );
    }
    if (allowed && !allowed.has(li.shopifyVariantId)) {
      return NextResponse.json(
        { error: "One or more items aren’t available to your brand." },
        { status: 400 },
      );
    }
    lines.push({ v, quantity: li.quantity });
  }

  // Deposit terms: when the brand requires a deposit, bill only the deposit now
  // (single custom line); the balance is billed when the order is fulfilled.
  const discountPercent = comp.priceTier?.discountPercent ?? 0;
  const totals = computeInvoiceTotals(
    lines.map(({ v, quantity }) => ({ quantity, unitPriceCents: v.priceCents })),
    discountPercent,
  );
  const split = computeDeposit(totals.totalCents, comp.depositPercent ?? 0);
  const hasDeposit = split.depositCents > 0 && split.balanceCents > 0;

  // 1) Shopify draft order (the payment checkout).
  let draft;
  try {
    draft = await getShopifyClient().createDraftOrderInvoice({
      email: scope.email ?? comp.contactEmail ?? null,
      shopifyCustomerId: comp.customer?.shopifyId ?? null,
      discountPercent: hasDeposit ? 0 : discountPercent,
      note: hasDeposit
        ? `Portal order deposit (${comp.depositPercent}%) — ${comp.name}`
        : `Portal order — ${comp.name}`,
      lines: hasDeposit
        ? [
            {
              variantId: null,
              title: `Deposit (${comp.depositPercent}%) — ${comp.name}`,
              quantity: 1,
              unitPriceCents: split.depositCents,
            },
          ]
        : lines.map(({ v, quantity }) => ({
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

  // Snapshot the deposit terms onto the recorded invoice.
  if (hasDeposit) {
    await snapshotInvoiceDeposit(order.id, comp.depositPercent ?? 0, totals.totalCents);
  }

  return NextResponse.json(
    {
      data: {
        invoiceId: order.id,
        invoiceNumber: order.invoiceNumber,
        payUrl: draft.invoiceUrl,
        deposit: hasDeposit
          ? {
              percent: comp.depositPercent,
              depositCents: split.depositCents,
              balanceCents: split.balanceCents,
            }
          : null,
      },
    },
    { status: 201 },
  );
}
