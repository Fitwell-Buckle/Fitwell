import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  invoice,
  invoiceLineItem,
  company,
  productionPo,
} from "@/lib/schema";
import { createPo } from "@/lib/production/service";
import { getShopifyClient } from "@/lib/shopify/client";
import {
  computeInvoiceTotals,
  computeDeposit,
  formatInvoiceNumber,
  groupByCompany,
  type InvoiceStatus,
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

export const invoiceLineInputSchema = z.object({
  sku: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  shopifyProductId: z.string().max(200).nullish(),
  shopifyVariantId: z.string().max(200).nullish(),
});

export const createInvoiceSchema = z.object({
  companyId: z.string().min(1),
  issuedDate: dateString,
  dueDate: dateString.nullish(),
  notes: z.string().max(5000).nullish(),
  lineItems: z.array(invoiceLineInputSchema).min(1, "an invoice needs at least one line"),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const updateInvoiceSchema = z.object({
  issuedDate: dateString,
  dueDate: dateString.nullable(),
  notes: z.string().max(5000).nullable(),
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
      discountPercent,
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
    })),
  );

  return { id: inv.id, invoiceNumber };
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
    })),
  );

  return { ok: true };
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
  return db.query.invoice.findFirst({
    where: eq(invoice.id, invoiceId),
    with: {
      company: {
        columns: {
          id: true,
          name: true,
          contactName: true,
          contactEmail: true,
          depositPercent: true,
        },
        with: {
          priceTier: { columns: { name: true, discountPercent: true } },
          customer: { columns: { email: true, shopifyId: true } },
        },
      },
      lineItems: true,
      sourcePo: { columns: { id: true, shopifyPoNumber: true } },
    },
  });
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
  | { ok: true; balancePayUrl: string | null; note: string }
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

  // No deposit (paid in full up front) or nothing left to bill → just stamp it.
  if (inv.depositCents <= 0 || balanceCents <= 0) {
    await db
      .update(invoice)
      .set({ fulfilledAt: now, updatedAt: now })
      .where(eq(invoice.id, invoiceId));
    return { ok: true, balancePayUrl: null, note: "Marked fulfilled (no balance due)." };
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
  return { ok: true, balancePayUrl, note };
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
      shopifyDraftOrderId: params.shopifyDraftOrderId,
      shopifyInvoiceUrl: params.shopifyInvoiceUrl,
      updatedAt: new Date(),
    })
    .where(eq(invoice.id, created.id));
  return created;
}
