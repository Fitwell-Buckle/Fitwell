import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { company, invoice, invoiceLineItem, type InvoiceShipTo } from "@/lib/schema";
import { shipToToShopify, buildSplitShipping } from "@/lib/portal/addresses";
import {
  getCatalogCached,
  getCatalogGroupsCached,
  allowedVariantIds,
  type CatalogVariant,
  type CatalogCollectionGroup,
} from "@/lib/catalog/load";
import { getShopifyClient } from "@/lib/shopify/client";
import { createInvoice, snapshotInvoiceDeposit } from "./service";
import { notifyNewB2bOrder, notifyB2bDraft } from "./order-notifications";
import { computeInvoiceTotals, computeDeposit, draftDiscountPercent } from "./invoicing";
import { getBillingSettings } from "./billing-settings";
import type { CompanyScope } from "@/lib/portal/company-session";

// Portal order lifecycle, company-scoped:
//   draft  → saved, NO Shopify transaction yet, freely editable
//   sent   → submitted; a Shopify draft order (pay link) exists; still editable
//            while unpaid (editing regenerates the link)
//   paid   → locked (view only)
// Shared by the portal order endpoints so the rules live in one place.

export type PortalLineInput = {
  shopifyVariantId: string;
  quantity: number;
  /** Per-line split-fulfillment ship-to (Phase B). null = ship to the order's primary address. */
  shipTo?: InvoiceShipTo | null;
};
export type PaymentMethod = "card" | "wire";
export type PortalError = { ok: false; status: number; error: string };

function isErr(x: unknown): x is PortalError {
  return typeof x === "object" && x !== null && (x as { ok?: boolean }).ok === false;
}

const lineTitle = (v: CatalogVariant) =>
  v.variantTitle ? `${v.title} — ${v.variantTitle}` : v.title;

function isScopeError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("write_draft_orders") || m.includes("access denied") || m.includes("403");
}

type ResolvedCompany = {
  id: string;
  name: string;
  contactEmail: string | null;
  depositPercent: number;
  allowWirePayment: boolean;
  discountPercent: number;
  shopifyCustomerId: string | null;
};

type Resolved = {
  comp: ResolvedCompany;
  lines: { v: CatalogVariant; quantity: number; shipTo: InvoiceShipTo | null }[];
};

/**
 * Resolve a cart against the catalog + the brand's catalog restriction. Returns
 * the priced lines and company terms, or a PortalError. Defense in depth — the
 * portal already hides disallowed items.
 */
async function resolveCart(
  companyId: string,
  lineItems: PortalLineInput[],
): Promise<Resolved | PortalError> {
  const comp = await db.query.company.findFirst({
    where: eq(company.id, companyId),
    columns: {
      id: true,
      name: true,
      contactEmail: true,
      assignedCollectionIds: true,
      assignedProductIds: true,
      depositPercent: true,
      allowWirePayment: true,
    },
    with: {
      priceTier: { columns: { discountPercent: true } },
      customer: { columns: { shopifyId: true } },
    },
  });
  if (!comp) return { ok: false, status: 404, error: "Customer not found" };

  let catalog;
  try {
    catalog = await getCatalogCached();
  } catch {
    return {
      ok: false,
      status: 502,
      error: "Catalog is unavailable right now — please try again.",
    };
  }
  const byVariant = new Map(catalog.map((v) => [v.shopifyVariantId, v]));

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

  const lines: Resolved["lines"] = [];
  for (const li of lineItems) {
    const v = byVariant.get(li.shopifyVariantId);
    if (!v) {
      return { ok: false, status: 400, error: "One or more items are no longer available." };
    }
    if (allowed && !allowed.has(li.shopifyVariantId)) {
      return { ok: false, status: 400, error: "One or more items aren’t available to your brand." };
    }
    lines.push({ v, quantity: li.quantity, shipTo: li.shipTo ?? null });
  }

  return {
    comp: {
      id: comp.id,
      name: comp.name,
      contactEmail: comp.contactEmail,
      depositPercent: comp.depositPercent ?? 0,
      allowWirePayment: comp.allowWirePayment ?? false,
      discountPercent: comp.priceTier?.discountPercent ?? 0,
      shopifyCustomerId: comp.customer?.shopifyId ?? null,
    },
    lines,
  };
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Save a new draft order for the company — recorded as a `draft` invoice with
 * NO Shopify transaction. The buyer can keep editing it and submit later.
 */
export async function createPortalDraft(
  scope: CompanyScope,
  lineItems: PortalLineInput[],
  shipTo?: InvoiceShipTo | null,
): Promise<{ ok: true; invoiceId: string; invoiceNumber: string } | PortalError> {
  const r = await resolveCart(scope.companyId, lineItems);
  if (isErr(r)) return r;

  const created = await createInvoice({
    companyId: scope.companyId,
    issuedDate: today(),
    lineItems: r.lines.map(({ v, quantity, shipTo: lineShipTo }) => ({
      sku: v.sku,
      title: lineTitle(v),
      quantity,
      unitPriceCents: v.priceCents,
      shopifyProductId: v.shopifyProductId,
      shopifyVariantId: v.shopifyVariantId,
      shipTo: lineShipTo,
    })),
  });
  if (shipTo) {
    await db.update(invoice).set({ shipTo, updatedAt: new Date() }).where(eq(invoice.id, created.id));
  }

  // Notify admins a buyer started a draft (blue dot + email). Best-effort.
  await notifyB2bDraft({
    invoiceId: created.id,
    invoiceNumber: created.invoiceNumber,
    companyName: r.comp.name,
  });

  return { ok: true, invoiceId: created.id, invoiceNumber: created.invoiceNumber };
}

/**
 * Replace an order's line items (lines-only — leaves issued/due/notes/deposit
 * terms untouched). Allowed only while the order is the company's own and not
 * yet paid/void. Recomputes money from the invoice's snapshotted discount.
 */
export async function savePortalOrderLines(
  scope: CompanyScope,
  invoiceId: string,
  lineItems: PortalLineInput[],
  shipTo?: InvoiceShipTo | null,
): Promise<{ ok: true; status: string; paymentMethod: PaymentMethod } | PortalError> {
  const inv = await db.query.invoice.findFirst({
    where: eq(invoice.id, invoiceId),
    columns: { id: true, companyId: true, status: true, discountPercent: true, paymentMethod: true },
  });
  if (!inv || inv.companyId !== scope.companyId) {
    return { ok: false, status: 404, error: "Order not found" };
  }
  if (inv.status === "paid" || inv.status === "void") {
    return { ok: false, status: 409, error: `Can't edit a ${inv.status} order.` };
  }

  const r = await resolveCart(scope.companyId, lineItems);
  if (isErr(r)) return r;

  const totals = computeInvoiceTotals(
    r.lines.map(({ v, quantity }) => ({ quantity, unitPriceCents: v.priceCents })),
    inv.discountPercent ?? 0,
  );

  await db
    .update(invoice)
    .set({
      ...totals,
      // shipTo === undefined → leave unchanged; null → clear; object → set.
      ...(shipTo !== undefined ? { shipTo } : {}),
      updatedAt: new Date(),
    })
    .where(eq(invoice.id, invoiceId));
  await db.delete(invoiceLineItem).where(eq(invoiceLineItem.invoiceId, invoiceId));
  await db.insert(invoiceLineItem).values(
    r.lines.map(({ v, quantity, shipTo: lineShipTo }) => ({
      invoiceId,
      sku: v.sku,
      title: lineTitle(v),
      quantity,
      unitPriceCents: v.priceCents,
      shopifyProductId: v.shopifyProductId,
      shopifyVariantId: v.shopifyVariantId,
      shipTo: lineShipTo,
    })),
  );

  return {
    ok: true,
    status: inv.status,
    paymentMethod: (inv.paymentMethod as PaymentMethod) ?? "card",
  };
}

export type SubmitResult = {
  ok: true;
  invoiceId: string;
  invoiceNumber: string;
  paymentMethod: PaymentMethod;
  payUrl: string | null;
  wireInstructions: string | null;
  totalCents: number;
  deposit: { percent: number; depositCents: number; balanceCents: number } | null;
};

/**
 * Submit (or re-submit) an existing draft/sent order: (re)create the Shopify
 * draft order from the order's current lines, repoint the pay link, set it
 * `sent`, and snapshot deposit terms. When the order already had a Shopify
 * draft order (an edit while unpaid), the stale one is deleted so the buyer's
 * Shopify Admin doesn't accumulate duplicates. Card returns a pay URL; wire
 * returns the remittance instructions instead (no forced card checkout).
 */
export async function submitPortalOrder(
  scope: CompanyScope,
  invoiceId: string,
  paymentMethod: PaymentMethod,
): Promise<SubmitResult | PortalError> {
  const inv = await db.query.invoice.findFirst({
    where: eq(invoice.id, invoiceId),
    columns: {
      id: true,
      invoiceNumber: true,
      companyId: true,
      status: true,
      discountPercent: true,
      shopifyDraftOrderId: true,
      shipTo: true,
    },
    with: {
      lineItems: true,
      company: {
        columns: {
          name: true,
          contactEmail: true,
          depositPercent: true,
          allowWirePayment: true,
        },
        with: { customer: { columns: { shopifyId: true } } },
      },
    },
  });
  if (!inv || inv.companyId !== scope.companyId) {
    return { ok: false, status: 404, error: "Order not found" };
  }
  if (inv.status === "paid" || inv.status === "void") {
    return { ok: false, status: 409, error: `Can't submit a ${inv.status} order.` };
  }
  if (inv.lineItems.length === 0) {
    return { ok: false, status: 400, error: "Your order is empty." };
  }

  // A brand-new order = a draft being submitted for the first time. Edits /
  // regenerations of an already-sent order don't re-notify.
  const isNewOrder = inv.status === "draft";

  const wire = paymentMethod === "wire";
  if (wire && !inv.company.allowWirePayment) {
    return { ok: false, status: 400, error: "Bank-wire payment isn't enabled for your account." };
  }

  const discountPercent = inv.discountPercent ?? 0;
  const totals = computeInvoiceTotals(
    inv.lineItems.map((l) => ({ quantity: l.quantity, unitPriceCents: l.unitPriceCents })),
    discountPercent,
  );
  // Wire orders are billed in full (pay later) — the deposit-now split only
  // applies to card checkout.
  const depositPercent = inv.company.depositPercent ?? 0;
  const split = computeDeposit(totals.totalCents, depositPercent);
  const hasDeposit = !wire && split.depositCents > 0 && split.balanceCents > 0;

  // Split fulfillment: record each line's destination as a "Ship to" custom
  // attribute + a grouped order note (Shopify can't hold >1 destination).
  const { productLines, splitNote } = buildSplitShipping(inv.lineItems, inv.shipTo ?? null);

  let draft;
  try {
    draft = await getShopifyClient().createDraftOrderInvoice({
      email: scope.email ?? inv.company.contactEmail ?? null,
      shopifyCustomerId: inv.company.customer?.shopifyId ?? null,
      shippingAddress: inv.shipTo ? shipToToShopify(inv.shipTo) : undefined,
      discountPercent: draftDiscountPercent({
        totalCents: totals.totalCents,
        hasDeposit,
        tierPercent: discountPercent,
      }),
      note:
        (hasDeposit
          ? `Portal order deposit (${depositPercent}%) — ${inv.company.name}`
          : `Portal order — ${inv.company.name}`) + splitNote,
      lines: hasDeposit
        ? [
            {
              variantId: null,
              title: `Deposit (${depositPercent}%) — ${inv.company.name}`,
              quantity: 1,
              unitPriceCents: split.depositCents,
            },
          ]
        : productLines,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (isScopeError(message)) {
      return {
        ok: false,
        status: 503,
        error:
          "Online checkout isn't enabled yet. Please contact Fitwell to complete this order.",
      };
    }
    console.error("Portal order submit draft failed:", err);
    return { ok: false, status: 502, error: "Submit failed — please try again." };
  }

  // Drop the stale draft order (an edit while unpaid) so Shopify Admin doesn't
  // keep duplicate, wrong-amount drafts. Best-effort.
  if (inv.shopifyDraftOrderId) {
    try {
      await getShopifyClient().deleteDraftOrder(inv.shopifyDraftOrderId);
    } catch (err) {
      console.error("Stale draft order delete failed:", err);
    }
  }

  await db
    .update(invoice)
    .set({
      status: "sent",
      sentAt: new Date(),
      paymentMethod: wire ? "wire" : "card",
      shopifyDraftOrderId: draft.draftOrderId,
      shopifyInvoiceUrl: draft.invoiceUrl,
      updatedAt: new Date(),
    })
    .where(eq(invoice.id, invoiceId));

  // Snapshot (or clear) the deposit terms for the current total.
  await snapshotInvoiceDeposit(invoiceId, hasDeposit ? depositPercent : 0, totals.totalCents);

  // Notify admins of a genuinely new order (blue dot + email). Best-effort.
  if (isNewOrder) {
    await notifyNewB2bOrder({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      companyName: inv.company.name,
      totalCents: totals.totalCents,
      paymentMethod: wire ? "wire" : "card",
    });
  }

  let wireInstructions: string | null = null;
  if (wire) {
    try {
      wireInstructions = (await getBillingSettings())?.instructions ?? null;
    } catch {
      /* best-effort — the order is recorded regardless */
    }
  }

  return {
    ok: true,
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    paymentMethod: wire ? "wire" : "card",
    payUrl: wire ? null : draft.invoiceUrl,
    wireInstructions,
    totalCents: totals.totalCents,
    deposit: hasDeposit
      ? { percent: depositPercent, depositCents: split.depositCents, balanceCents: split.balanceCents }
      : null,
  };
}
