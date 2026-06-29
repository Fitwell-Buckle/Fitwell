/**
 * Parse + import shipping costs from Shopify's billing CSV export
 * (Settings → Billing → Export bills). This is the ONLY source of what we paid
 * to ship — the Shopify Admin API does not expose label cost.
 *
 * The export has one row per billed charge. We keep only `shipping_fee` rows:
 * those are the per-label carrier charges and they always carry the order name
 * (e.g. "FBC1490") in the Order column. Other shipping categories
 * (`managed_markets_shipping_fee`, duties, insurance) either don't reference an
 * order on the export or aren't a label cost, so they're out of scope here.
 *
 * See specs/work-plans/todo/shipping-costs.md.
 */
import { db } from "@/lib/db";
import { order, shippingCharge } from "@/lib/schema";
import { toCents } from "./client";
import { eq, inArray } from "drizzle-orm";

export const SHIPPING_FEE_CATEGORY = "shipping_fee";

/** A normalized, db-ready shipping charge parsed from one CSV row. */
export interface ParsedShippingCharge {
  billNumber: string;
  orderName: string;
  /** Numeric part of the order name ("FBC1490" → 1490) — the order match key. */
  orderNumber: number;
  chargeCategory: string;
  description: string | null;
  service: string | null;
  destination: string | null;
  amountCents: number;
  currency: string;
  chargedAt: Date | null;
}

/** Minimal RFC-4180 CSV parser: handles quoted fields containing commas/newlines. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Split a shipping description into service + destination on the first " to ".
 * "DHL Express Worldwide to Ravensburg, " → { service: "DHL Express Worldwide",
 * destination: "Ravensburg" }. Falls back to {service: whole, destination: null}
 * when there's no " to " separator.
 */
export function splitDescription(description: string | null): {
  service: string | null;
  destination: string | null;
} {
  if (!description) return { service: null, destination: null };
  const i = description.indexOf(" to ");
  if (i === -1) return { service: description.trim() || null, destination: null };
  const service = description.slice(0, i).trim() || null;
  const destination = description.slice(i + 4).replace(/,\s*$/, "").trim() || null;
  return { service, destination };
}

/**
 * Parse a Shopify billing CSV into normalized shipping charges. Pure: no db.
 * Keeps only `shipping_fee` rows with a parseable `FBC<number>` order name.
 */
export function parseBillingCsv(text: string): ParsedShippingCharge[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];
  const header = rows[0];
  const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  const need = ["Bill #", "Charge category", "Description", "Amount", "Currency", "Date", "Order"];
  for (const c of need) {
    if (col[c] === undefined) throw new Error(`Billing CSV missing expected column: "${c}"`);
  }

  const out: ParsedShippingCharge[] = [];
  for (const r of rows.slice(1)) {
    if (r.length < header.length - 2 || !r[col["Bill #"]]) continue; // skip blanks
    if (r[col["Charge category"]] !== SHIPPING_FEE_CATEGORY) continue;
    const orderName = (r[col["Order"]] ?? "").trim();
    const digits = orderName.replace(/\D/g, "");
    if (!digits) continue; // shipping_fee without an order name — skip (shouldn't happen)
    const description = (r[col["Description"]] ?? "").trim() || null;
    const { service, destination } = splitDescription(description);
    const dateStr = (r[col["Date"]] ?? "").trim();
    out.push({
      billNumber: r[col["Bill #"]].trim(),
      orderName,
      orderNumber: Number(digits),
      chargeCategory: SHIPPING_FEE_CATEGORY,
      description,
      service,
      destination,
      amountCents: toCents(r[col["Amount"]]),
      currency: (r[col["Currency"]] ?? "USD").trim() || "USD",
      chargedAt: dateStr ? new Date(dateStr) : null,
    });
  }
  return out;
}

export interface ImportResult {
  bills: number;
  totalCharges: number;
  matchedCharges: number;
  unmatchedCharges: number;
  totalCents: number;
  matchedCents: number;
  /** Distinct order names that didn't resolve to an order in our DB. */
  unmatchedOrderNames: string[];
}

/**
 * Import parsed charges into `shipping_charge`, idempotently. Idempotency is
 * scoped by Bill #: every bill present in the file has its existing rows deleted
 * and reinserted, so re-importing the same (or an overlapping) export never
 * double-counts. Bills are immutable once issued, so this is safe.
 *
 * Order matching: `orderNumber` → `order.shopify_order_number`. Unmatched
 * charges are still recorded (orderId = null, orderName kept) so a later
 * re-import after the order syncs can link them.
 */
export async function importShippingCharges(
  charges: ParsedShippingCharge[],
): Promise<ImportResult> {
  // Resolve order ids in one query.
  const numbers = [...new Set(charges.map((c) => c.orderNumber))];
  const orderRows = numbers.length
    ? await db
        .select({ id: order.id, num: order.shopifyOrderNumber })
        .from(order)
        .where(inArray(order.shopifyOrderNumber, numbers))
    : [];
  const orderIdByNumber = new Map<number, string>();
  for (const r of orderRows) if (r.num != null) orderIdByNumber.set(r.num, r.id);

  // Group by bill so we can delete-replace per bill.
  const byBill = new Map<string, ParsedShippingCharge[]>();
  for (const c of charges) {
    const list = byBill.get(c.billNumber) ?? [];
    list.push(c);
    byBill.set(c.billNumber, list);
  }

  const result: ImportResult = {
    bills: byBill.size,
    totalCharges: charges.length,
    matchedCharges: 0,
    unmatchedCharges: 0,
    totalCents: 0,
    matchedCents: 0,
    unmatchedOrderNames: [],
  };
  const unmatched = new Set<string>();

  for (const [billNumber, billCharges] of byBill) {
    // Delete-replace this bill's charges (re-runnable, no double counting).
    await db.delete(shippingCharge).where(eq(shippingCharge.billNumber, billNumber));
    await db.insert(shippingCharge).values(
      billCharges.map((c) => {
        const orderId = orderIdByNumber.get(c.orderNumber) ?? null;
        result.totalCents += c.amountCents;
        if (orderId) {
          result.matchedCharges++;
          result.matchedCents += c.amountCents;
        } else {
          result.unmatchedCharges++;
          unmatched.add(c.orderName);
        }
        return {
          orderId,
          billNumber: c.billNumber,
          orderName: c.orderName,
          chargeCategory: c.chargeCategory,
          description: c.description,
          service: c.service,
          destination: c.destination,
          amountCents: c.amountCents,
          currency: c.currency,
          chargedAt: c.chargedAt,
        };
      }),
    );
  }

  result.unmatchedOrderNames = [...unmatched].sort();
  return result;
}
