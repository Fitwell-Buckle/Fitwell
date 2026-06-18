import { z } from "zod";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  invoice,
  invoiceLineItem,
  invoiceAttachment,
  company,
  customerAddress,
  productionPo,
} from "@/lib/schema";
import { createPo, createMultiSupplierPo } from "@/lib/production/service";
import type { ProductionStage } from "@/lib/production/stages";
import { getShopifyClient } from "@/lib/shopify/client";
import { shipToToShopify, buildSplitShipping } from "@/lib/portal/addresses";
import {
  computeInvoiceTotals,
  computeDeposit,
  formatInvoiceNumber,
  groupByCompany,
  type InvoiceStatus,
  type ShippableAddress,
} from "./invoicing";

function isScopeError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("write_draft_orders") || m.includes("access denied") || m.includes("403");
}

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date");

const today = () => new Date().toISOString().slice(0, 10);

/** Next invoice number from the sequence, formatted "INV-00100". */
async function nextInvoiceNumber(): Promise<string> {
  const seq = await db.execute(
    sql`SELECT nextval('invoice_number_seq')::int AS n`,
  );
  return formatInvoiceNumber(Number((seq.rows[0] as { n: number }).n));
}

// Per-line split-fulfillment ship-to snapshot (Phase B). Loosely validated —
// it's resolved server-side from one of the company's synced addresses, never
// raw client input.
const lineShipToSchema = z
  .object({
    addressId: z.string().nullish(),
    firstName: z.string().nullish(),
    lastName: z.string().nullish(),
    company: z.string().nullish(),
    address1: z.string().nullish(),
    address2: z.string().nullish(),
    city: z.string().nullish(),
    province: z.string().nullish(),
    provinceCode: z.string().nullish(),
    country: z.string().nullish(),
    zip: z.string().nullish(),
    phone: z.string().nullish(),
  })
  .nullish();

export const invoiceLineInputSchema = z.object({
  sku: z
    .string()
    .max(200)
    .min(1, "A line item is missing its SKU — add a SKU to that product in Shopify, then Refresh catalog and try again."),
  title: z.string().min(1).max(500),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  shopifyProductId: z.string().max(200).nullish(),
  shopifyVariantId: z.string().max(200).nullish(),
  shipTo: lineShipToSchema,
});

// Per-invoice deposit override. null/undefined = inherit the brand's default
// at send time (current behavior). A number (incl. 0) = this invoice has its
// own value and ignores the brand. 0 explicitly = no deposit on this invoice.
const depositPercentInput = z
  .number()
  .min(0, "deposit % must be ≥ 0")
  .max(100, "deposit % must be ≤ 100")
  .nullish();

export const createInvoiceSchema = z.object({
  companyId: z.string().min(1),
  issuedDate: dateString,
  dueDate: dateString.nullish(),
  notes: z.string().max(5000).nullish(),
  /** Override the brand's default deposit % for this invoice. */
  depositPercent: depositPercentInput,
  // Set when the invoice is created from a PO — links it back and prevents
  // creating a second invoice from the same PO.
  sourcePoId: z.string().max(200).nullish(),
  // Order-level (primary / default) ship-to snapshot. Per-line overrides live on
  // each line's shipTo (split fulfillment).
  shipTo: lineShipToSchema,
  lineItems: z.array(invoiceLineInputSchema).min(1, "an invoice needs at least one line"),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const updateInvoiceSchema = z.object({
  issuedDate: dateString,
  dueDate: dateString.nullable(),
  notes: z.string().max(5000).nullable(),
  /** Per-invoice deposit override; null clears it (falls back to brand default). */
  depositPercent: depositPercentInput,
  shipTo: lineShipToSchema,
  lineItems: z.array(invoiceLineInputSchema).min(1),
});
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

async function companyDiscount(companyId: string): Promise<number> {
  const c = await db.query.company.findFirst({
    where: eq(company.id, companyId),
    with: { priceTier: { columns: { discountPercent: true } } },
  });
  return c?.priceTier?.discountPercent ?? 0;
}

/** Manually create an invoice (company tier discount snapshotted at creation). */
export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<{ id: string; invoiceNumber: string }> {
  // One invoice per source PO — block a second create from the same PO.
  if (input.sourcePoId) {
    const existing = await db.query.invoice.findFirst({
      where: eq(invoice.sourcePoId, input.sourcePoId),
      columns: { id: true },
    });
    if (existing) throw new Error("An invoice already exists for this PO.");
  }

  const discountPercent = await companyDiscount(input.companyId);
  const totals = computeInvoiceTotals(input.lineItems, discountPercent);
  const invoiceNumber = await nextInvoiceNumber();

  const [inv] = await db
    .insert(invoice)
    .values({
      invoiceNumber,
      companyId: input.companyId,
      status: "draft",
      issuedDate: input.issuedDate,
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
      sourcePoId: input.sourcePoId ?? null,
      discountPercent,
      shipTo: input.shipTo ?? null,
      // Pre-set the per-invoice deposit override if the caller provided one.
      // Sent invoices still get depositCents recomputed by snapshotInvoiceDeposit.
      depositPercent: input.depositPercent ?? null,
      ...totals,
    })
    .returning({ id: invoice.id });

  await db.insert(invoiceLineItem).values(
    input.lineItems.map((l) => ({
      invoiceId: inv.id,
      sku: l.sku,
      title: l.title,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      shopifyProductId: l.shopifyProductId ?? null,
      shopifyVariantId: l.shopifyVariantId ?? null,
      shipTo: l.shipTo ?? null,
    })),
  );

  return { id: inv.id, invoiceNumber };
}

/** The invoice already created from this PO (for dedup + a "View invoice" link). */
export async function invoiceForPo(
  poId: string,
): Promise<{ id: string; invoiceNumber: string } | null> {
  const inv = await db.query.invoice.findFirst({
    where: eq(invoice.sourcePoId, poId),
    columns: { id: true, invoiceNumber: true },
  });
  return inv ?? null;
}

export interface InvoiceFromPoResult {
  invoices: { id: string; invoiceNumber: string; companyId: string }[];
  /** Line items with no bill-to company, which can't be invoiced. */
  unassignedCount: number;
}

/**
 * Create invoices from a PO — one per bill-to company (a line's company
 * override, else the PO default). Unit prices come from `retailByVariant`
 * (resolved from Shopify by the caller); the company's tier discount applies.
 */
export async function createInvoiceFromPo(
  poId: string,
  retailByVariant: Map<string, number>,
): Promise<InvoiceFromPoResult> {
  const po = await db.query.productionPo.findFirst({
    where: eq(productionPo.id, poId),
    columns: { id: true, companyId: true },
    with: { lineItems: true },
  });
  if (!po) throw new Error(`production PO ${poId} not found`);

  const tagged = po.lineItems.map((li) => ({
    li,
    companyId: li.companyId ?? po.companyId ?? null,
  }));
  const { groups, unassigned } = groupByCompany(tagged, (t) => t.companyId);

  const invoices: InvoiceFromPoResult["invoices"] = [];
  for (const g of groups) {
    const discountPercent = await companyDiscount(g.companyId);
    const lines = g.items.map(({ li }) => ({
      sku: li.sku,
      title: li.title,
      quantity: li.quantity,
      unitPriceCents: retailByVariant.get(li.shopifyVariantId ?? "") ?? 0,
      shopifyProductId: li.shopifyProductId,
      shopifyVariantId: li.shopifyVariantId,
      sourceLineItemId: li.id,
    }));
    const totals = computeInvoiceTotals(lines, discountPercent);
    const invoiceNumber = await nextInvoiceNumber();

    const [inv] = await db
      .insert(invoice)
      .values({
        invoiceNumber,
        companyId: g.companyId,
        status: "draft",
        issuedDate: today(),
        discountPercent,
        sourcePoId: poId,
        ...totals,
      })
      .returning({ id: invoice.id });

    await db.insert(invoiceLineItem).values(
      lines.map((l) => ({ invoiceId: inv.id, ...l })),
    );
    invoices.push({ id: inv.id, invoiceNumber, companyId: g.companyId });
  }

  return { invoices, unassignedCount: unassigned.length };
}

/**
 * Create a draft production PO from an invoice (fulfillment). Carries the
 * invoice's line items + bill-to company; production costs are left blank for
 * the buyer to fill in. The new PO references the invoice in its notes.
 */
export async function createPoFromInvoice(
  invoiceId: string,
  supplierId: string,
): Promise<{ poId: string; poNumber: string }> {
  const inv = await db.query.invoice.findFirst({
    where: eq(invoice.id, invoiceId),
    with: { lineItems: true },
  });
  if (!inv) throw new Error(`invoice ${invoiceId} not found`);

  return createPo({
    supplierId,
    issuedDate: today(),
    companyId: inv.companyId,
    notes: `From invoice ${inv.invoiceNumber}`,
    lineItems: inv.lineItems.map((l) => ({
      sku: l.sku,
      title: l.title,
      quantity: l.quantity,
      unitCostCents: null, // production cost TBD
      shopifyProductId: l.shopifyProductId,
      shopifyVariantId: l.shopifyVariantId,
    })),
  });
}

/**
 * Like createPoFromInvoice, but splits the new PO across multiple suppliers by
 * stage (generates a master + one sub-PO per supplier). primarySupplierId is the
 * master's fallback for any unassigned stage.
 */
export async function createMultiSupplierPoFromInvoice(
  invoiceId: string,
  primarySupplierId: string,
  stageAssignments: { stage: ProductionStage; supplierId: string }[],
): Promise<{ poId: string; poNumber: string; subPos: { id: string; suffix: string; supplierId: string }[] }> {
  const inv = await db.query.invoice.findFirst({
    where: eq(invoice.id, invoiceId),
    with: { lineItems: true },
  });
  if (!inv) throw new Error(`invoice ${invoiceId} not found`);

  return createMultiSupplierPo(
    {
      supplierId: primarySupplierId,
      issuedDate: today(),
      companyId: inv.companyId,
      notes: `From invoice ${inv.invoiceNumber}`,
      lineItems: inv.lineItems.map((l) => ({
        sku: l.sku,
        title: l.title,
        quantity: l.quantity,
        unitCostCents: null,
        shopifyProductId: l.shopifyProductId,
        shopifyVariantId: l.shopifyVariantId,
      })),
    },
    stageAssignments,
  );
}

export type UpdateInvoiceResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/** Full edit: header + replace line items, recomputing totals from the
 *  invoice's snapshotted discount. */
export async function updateInvoice(
  invoiceId: string,
  input: UpdateInvoiceInput,
): Promise<UpdateInvoiceResult> {
  const inv = await db.query.invoice.findFirst({
    where: eq(invoice.id, invoiceId),
    columns: { id: true, discountPercent: true, status: true },
  });
  if (!inv) return { ok: false, status: 404, error: "Not found" };
  if (inv.status === "paid" || inv.status === "void") {
    return { ok: false, status: 409, error: `Can't edit a ${inv.status} invoice.` };
  }

  const totals = computeInvoiceTotals(input.lineItems, inv.discountPercent ?? 0);
  await db
    .update(invoice)
    .set({
      issuedDate: input.issuedDate,
      dueDate: input.dueDate,
      notes: input.notes,
      // Per-invoice deposit override (null clears, falling back to brand default).
      // Recompute depositCents from the new % × new total so the snapshotted
      // amount stays consistent if the lines changed. Only does work pre-send;
      // sent invoices already had it set by snapshotInvoiceDeposit and an edit
      // is only allowed when status ≠ paid/void anyway.
      depositPercent: input.depositPercent ?? null,
      depositCents:
        input.depositPercent != null && input.depositPercent > 0
          ? Math.round((totals.totalCents * input.depositPercent) / 100)
          : 0,
      // shipTo === undefined → leave unchanged; null → clear; object → set.
      ...(input.shipTo !== undefined ? { shipTo: input.shipTo } : {}),
      updatedAt: new Date(),
      ...totals,
    })
    .where(eq(invoice.id, invoiceId));

  await db.delete(invoiceLineItem).where(eq(invoiceLineItem.invoiceId, invoiceId));
  await db.insert(invoiceLineItem).values(
    input.lineItems.map((l) => ({
      invoiceId,
      sku: l.sku,
      title: l.title,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      shopifyProductId: l.shopifyProductId ?? null,
      shopifyVariantId: l.shopifyVariantId ?? null,
      shipTo: l.shipTo ?? null,
    })),
  );

  return { ok: true };
}

/**
 * Re-apply a company's CURRENT tier discount to its open invoices — called
 * after the company's price tier changes. Re-prices drafts and unpaid sent
 * invoices (recomputing the discount, totals, and deposit amount) and
 * regenerates the Shopify pay link for sent, Shopify-linked invoices so the
 * amount charged matches the new total. Left untouched: paid, void, and any
 * invoice with a payment already received (full / deposit / balance) — those
 * are settled history. Best-effort per invoice on the Shopify side: a draft-
 * order failure is logged and counted, never blocking the rest.
 */
export async function reapplyTierToOpenInvoices(
  companyId: string,
): Promise<{ repriced: number; regenerated: number; shopifyFailures: number }> {
  const comp = await db.query.company.findFirst({
    where: eq(company.id, companyId),
    columns: { id: true, name: true, contactEmail: true },
    with: {
      priceTier: { columns: { discountPercent: true } },
      customer: { columns: { shopifyId: true } },
    },
  });
  if (!comp) return { repriced: 0, regenerated: 0, shopifyFailures: 0 };

  const newDiscount = comp.priceTier?.discountPercent ?? 0;
  const shopifyCustomerId = comp.customer?.shopifyId ?? null;

  // Open = draft or sent, with NOTHING paid yet (full, deposit, or balance).
  const open = await db.query.invoice.findMany({
    where: and(
      eq(invoice.companyId, companyId),
      inArray(invoice.status, ["draft", "sent"]),
      isNull(invoice.paidAt),
      isNull(invoice.depositPaidAt),
      isNull(invoice.balancePaidAt),
    ),
    with: { lineItems: true },
  });

  let repriced = 0;
  let regenerated = 0;
  let shopifyFailures = 0;

  for (const inv of open) {
    const totals = computeInvoiceTotals(
      inv.lineItems.map((l) => ({ quantity: l.quantity, unitPriceCents: l.unitPriceCents })),
      newDiscount,
    );
    // Recompute the deposit AMOUNT off the new total, keeping the invoice's
    // existing deposit % (its send-time snapshot, or 0 if none) — so we never
    // surprise an order with a deposit it didn't have.
    const depositPercent = inv.depositPercent ?? 0;
    const split = computeDeposit(totals.totalCents, depositPercent);

    await db
      .update(invoice)
      .set({
        discountPercent: newDiscount,
        ...totals,
        depositCents: split.depositCents,
        updatedAt: new Date(),
      })
      .where(eq(invoice.id, inv.id));
    repriced++;

    // Regenerate the live Shopify pay link for sent, Shopify-linked invoices so
    // the customer is charged the new amount. Drafts have no pay link yet.
    if (inv.status === "sent" && shopifyCustomerId) {
      const hasDeposit = split.depositCents > 0 && split.balanceCents > 0;
      const { productLines, splitNote } = buildSplitShipping(inv.lineItems, inv.shipTo ?? null);
      try {
        const r = await getShopifyClient().createDraftOrderInvoice({
          email: comp.contactEmail,
          shopifyCustomerId,
          shippingAddress: inv.shipTo ? shipToToShopify(inv.shipTo) : undefined,
          discountPercent: hasDeposit ? 0 : newDiscount,
          note:
            (hasDeposit
              ? `Deposit (${depositPercent}%) for invoice ${inv.invoiceNumber}`
              : `Invoice ${inv.invoiceNumber}`) + splitNote,
          lines: hasDeposit
            ? [
                {
                  variantId: null,
                  title: `Deposit (${depositPercent}%) — ${inv.invoiceNumber}`,
                  quantity: 1,
                  unitPriceCents: split.depositCents,
                },
              ]
            : productLines,
        });
        // Drop the stale draft order so Shopify Admin doesn't keep duplicates.
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
            shopifyDraftOrderId: r.draftOrderId,
            shopifyInvoiceUrl: r.invoiceUrl,
            updatedAt: new Date(),
          })
          .where(eq(invoice.id, inv.id));
        regenerated++;
      } catch (err) {
        console.error(`Re-pricing draft order failed for ${inv.invoiceNumber}:`, err);
        shopifyFailures++;
      }
    }
  }

  return { repriced, regenerated, shopifyFailures };
}

/** Set an invoice's status, stamping sent_at / paid_at as appropriate. */
export async function updateInvoiceStatus(
  invoiceId: string,
  status: InvoiceStatus,
): Promise<{ id: string } | null> {
  const now = new Date();
  const patch: Record<string, unknown> = { status, updatedAt: now };
  if (status === "sent") patch.sentAt = now;
  if (status === "paid") patch.paidAt = now;

  const [row] = await db
    .update(invoice)
    .set(patch)
    .where(eq(invoice.id, invoiceId))
    .returning({ id: invoice.id });
  return row ?? null;
}

/** Invoice with company (+ tier + Shopify customer link), line items, source PO. */
export async function getInvoiceDetail(invoiceId: string) {
  const inv = await db.query.invoice.findFirst({
    where: eq(invoice.id, invoiceId),
    with: {
      company: {
        columns: {
          id: true,
          name: true,
          contactName: true,
          contactEmail: true,
          address: true,
          customerId: true,
          depositPercent: true,
        },
        with: {
          priceTier: { columns: { name: true, discountPercent: true } },
          customer: { columns: { id: true, email: true, shopifyId: true } },
        },
      },
      lineItems: true,
      sourcePo: { columns: { id: true, shopifyPoNumber: true } },
      attachments: {
        columns: {
          id: true,
          blobUrl: true,
          filename: true,
          contentType: true,
          sizeBytes: true,
          uploadedAt: true,
        },
        orderBy: (a, { desc }) => desc(a.uploadedAt),
      },
    },
  });
  if (!inv) return inv;

  // Primary shipping address = the linked Shopify customer's default (or first)
  // synced address. If it isn't synced yet (the customer_address backfill hasn't
  // reached this customer), fall back to fetching it live from Shopify so the
  // invoice still shows it. Read-only — Shopify stays the source of truth.
  let shippingAddress: ShippableAddress | null = null;
  // The invoice's CHOSEN ship-to (set via the ship-to picker, stored as the
  // `shipTo` snapshot) wins — it's what the order actually ships to and what the
  // Shopify draft order uses. Only fall back to the customer's default address
  // when no ship-to was picked.
  if (inv.shipTo) {
    shippingAddress = {
      firstName: inv.shipTo.firstName ?? null,
      lastName: inv.shipTo.lastName ?? null,
      company: inv.shipTo.company ?? null,
      address1: inv.shipTo.address1 ?? null,
      address2: inv.shipTo.address2 ?? null,
      city: inv.shipTo.city ?? null,
      province: inv.shipTo.province ?? null,
      provinceCode: inv.shipTo.provinceCode ?? null,
      zip: inv.shipTo.zip ?? null,
      country: inv.shipTo.country ?? null,
    };
  }
  const linkedCustomerId = inv.company?.customerId ?? null;
  if (!shippingAddress && linkedCustomerId) {
    shippingAddress =
      (await db.query.customerAddress.findFirst({
        where: eq(customerAddress.customerId, linkedCustomerId),
        orderBy: (a, { desc }) => [desc(a.isDefault)],
      })) ?? null;

    if (!shippingAddress && inv.company?.customer?.shopifyId) {
      try {
        const c = await getShopifyClient().getCustomer(
          inv.company.customer.shopifyId,
        );
        const a = c.default_address ?? c.addresses?.[0] ?? null;
        if (a) {
          shippingAddress = {
            firstName: a.first_name ?? null,
            lastName: a.last_name ?? null,
            company: a.company ?? null,
            address1: a.address1 ?? null,
            address2: a.address2 ?? null,
            city: a.city ?? null,
            province: a.province ?? null,
            provinceCode: a.province_code ?? null,
            zip: a.zip ?? null,
            country: a.country ?? null,
          };
        }
      } catch (err) {
        console.error("invoice ship-to live Shopify fetch failed:", err);
      }
    }
  }
  return { ...inv, shippingAddress };
}

/** Record a customer document (e.g. their PDF purchase order) on an invoice. */
export async function addInvoiceAttachment(input: {
  invoiceId: string;
  blobUrl: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number;
  uploadedByUserId?: string | null;
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(invoiceAttachment)
    .values({
      invoiceId: input.invoiceId,
      blobUrl: input.blobUrl,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      uploadedByUserId: input.uploadedByUserId ?? null,
    })
    .returning({ id: invoiceAttachment.id });
  return row;
}

/** Invoices for the list page, newest first, with company name + totals. */
export async function listInvoices() {
  return db.query.invoice.findMany({
    orderBy: desc(invoice.createdAt),
    with: { company: { columns: { name: true } } },
  });
}

/** A single company's invoices/orders, newest first (B2B portal order history). */
export async function listInvoicesForCompany(companyId: string) {
  return db.query.invoice.findMany({
    where: eq(invoice.companyId, companyId),
    orderBy: desc(invoice.createdAt),
  });
}

/**
 * Snapshot a brand's deposit terms onto an invoice (the deposit % + the deposit
 * amount due now), computed from the invoice's current total. Returns the split.
 * Called when an order is first sent / placed.
 */
export async function snapshotInvoiceDeposit(
  invoiceId: string,
  depositPercent: number,
  totalCents: number,
): Promise<{ depositCents: number; balanceCents: number }> {
  const split = computeDeposit(totalCents, depositPercent);
  await db
    .update(invoice)
    .set({
      depositPercent: depositPercent > 0 ? depositPercent : null,
      depositCents: split.depositCents,
      updatedAt: new Date(),
    })
    .where(eq(invoice.id, invoiceId));
  return split;
}

export type FulfillResult =
  | {
      ok: true;
      balancePayUrl: string | null;
      note: string;
      /** Balance amount left to collect ($0 when no deposit was taken). */
      balanceCents: number;
      /** Surfaced so the route can build / send the balance-due email. */
      invoiceNumber: string;
      companyName: string | null;
      contactEmail: string | null;
    }
  | { ok: false; status: number; error: string };

/**
 * Mark an invoice fulfilled. If a deposit was taken (so a balance remains),
 * create the balance Shopify draft order + payment link; otherwise just stamp
 * fulfilledAt. Idempotent-ish: refuses if already fulfilled. The Shopify push
 * degrades gracefully when the write_draft_orders scope is missing.
 */
export async function markInvoiceFulfilled(invoiceId: string): Promise<FulfillResult> {
  const inv = await db.query.invoice.findFirst({
    where: eq(invoice.id, invoiceId),
    with: {
      company: {
        columns: { name: true, contactEmail: true },
        with: { customer: { columns: { shopifyId: true } } },
      },
    },
  });
  if (!inv) return { ok: false, status: 404, error: "Not found" };
  if (inv.fulfilledAt) return { ok: false, status: 409, error: "Already fulfilled." };

  const now = new Date();
  const balanceCents = inv.depositCents > 0 ? inv.totalCents - inv.depositCents : 0;
  // Common context the route uses to email the balance link.
  const ctx = {
    balanceCents,
    invoiceNumber: inv.invoiceNumber,
    companyName: inv.company?.name ?? null,
    contactEmail: inv.company?.contactEmail ?? null,
  };

  // No deposit (paid in full up front) or nothing left to bill → just stamp it.
  if (inv.depositCents <= 0 || balanceCents <= 0) {
    await db
      .update(invoice)
      .set({ fulfilledAt: now, updatedAt: now })
      .where(eq(invoice.id, invoiceId));
    return {
      ok: true,
      balancePayUrl: null,
      note: "Marked fulfilled (no balance due).",
      ...ctx,
    };
  }

  // Bill the balance as a single custom-line draft order (the deposit already
  // covered its share; line detail lives on the invoice document).
  let balancePayUrl: string | null = null;
  let note = "Marked fulfilled.";
  try {
    const r = await getShopifyClient().createDraftOrderInvoice({
      email: inv.company?.contactEmail ?? null,
      shopifyCustomerId: inv.company?.customer?.shopifyId ?? null,
      discountPercent: 0,
      note: `Balance for invoice ${inv.invoiceNumber}`,
      lines: [
        {
          variantId: null,
          title: `Balance due — ${inv.invoiceNumber}`,
          quantity: 1,
          unitPriceCents: balanceCents,
        },
      ],
    });
    balancePayUrl = r.invoiceUrl;
    await db
      .update(invoice)
      .set({
        shopifyBalanceDraftOrderId: r.draftOrderId,
        shopifyBalanceInvoiceUrl: r.invoiceUrl,
        fulfilledAt: now,
        updatedAt: now,
      })
      .where(eq(invoice.id, invoiceId));
    note = "Marked fulfilled — created the balance payment link.";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    await db
      .update(invoice)
      .set({ fulfilledAt: now, updatedAt: now })
      .where(eq(invoice.id, invoiceId));
    note = isScopeError(msg)
      ? "Marked fulfilled — balance link skipped (grant write_draft_orders)."
      : "Marked fulfilled — balance draft order failed.";
    console.error("Balance draft order failed:", err);
  }
  return { ok: true, balancePayUrl, note, ...ctx };
}

export type MarkPaidResult =
  | { ok: true; fullyPaid: boolean }
  | { ok: false; status: number; error: string };

/**
 * Record that the deposit on a B2B invoice has been received. Stamps
 * depositPaidAt; the overall invoice status stays "sent" until the balance
 * lands too. Returns 409 if no deposit applies or the deposit was already
 * marked paid.
 */
export async function markDepositPaid(invoiceId: string): Promise<MarkPaidResult> {
  const inv = await db.query.invoice.findFirst({
    where: eq(invoice.id, invoiceId),
    columns: { id: true, depositPaidAt: true, depositCents: true },
  });
  if (!inv) return { ok: false, status: 404, error: "Not found" };
  if (inv.depositCents <= 0) {
    return { ok: false, status: 409, error: "No deposit to mark paid on this invoice." };
  }
  if (inv.depositPaidAt) {
    return { ok: false, status: 409, error: "Deposit is already marked paid." };
  }
  const now = new Date();
  await db
    .update(invoice)
    .set({ depositPaidAt: now, updatedAt: now })
    .where(eq(invoice.id, invoiceId));
  return { ok: true, fullyPaid: false };
}

/**
 * Record that the balance / final payment on a B2B invoice has been received.
 * Stamps balancePaidAt and — if the deposit is already complete (or there was
 * none) — auto-flips the invoice's overall status to "paid" + stamps paidAt
 * so list views and downstream consumers see the right state without a
 * second click. Returns 409 if the balance was already marked paid.
 */
export async function markBalancePaid(invoiceId: string): Promise<MarkPaidResult> {
  const inv = await db.query.invoice.findFirst({
    where: eq(invoice.id, invoiceId),
    columns: {
      id: true,
      status: true,
      balancePaidAt: true,
      depositPaidAt: true,
      depositCents: true,
    },
  });
  if (!inv) return { ok: false, status: 404, error: "Not found" };
  if (inv.balancePaidAt) {
    return { ok: false, status: 409, error: "Balance is already marked paid." };
  }
  const now = new Date();
  const depositComplete = inv.depositCents <= 0 || !!inv.depositPaidAt;
  const patch: Record<string, unknown> = { balancePaidAt: now, updatedAt: now };
  if (depositComplete && inv.status !== "paid") {
    patch.status = "paid";
    patch.paidAt = now;
  }
  await db.update(invoice).set(patch).where(eq(invoice.id, invoiceId));
  return { ok: true, fullyPaid: depositComplete };
}

/**
 * Record a self-serve company portal order: create the invoice (tier snapshot)
 * and mark it "sent" with the Shopify draft-order id + payment link. Called by
 * the portal checkout after the Shopify draft order is created.
 */
export async function recordCompanyOrder(params: {
  companyId: string;
  lineItems: CreateInvoiceInput["lineItems"];
  shopifyDraftOrderId: string;
  shopifyInvoiceUrl: string | null;
  /** How the customer chose to pay: "card" (default) or "wire" (pay later). */
  paymentMethod?: "card" | "wire";
}): Promise<{ id: string; invoiceNumber: string }> {
  const created = await createInvoice({
    companyId: params.companyId,
    issuedDate: today(),
    lineItems: params.lineItems,
  });
  await db
    .update(invoice)
    .set({
      status: "sent",
      sentAt: new Date(),
      paymentMethod: params.paymentMethod ?? "card",
      shopifyDraftOrderId: params.shopifyDraftOrderId,
      shopifyInvoiceUrl: params.shopifyInvoiceUrl,
      updatedAt: new Date(),
    })
    .where(eq(invoice.id, created.id));
  return created;
}
