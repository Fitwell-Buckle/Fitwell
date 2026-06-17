/**
 * One-time backfill of historical Shopify purchase orders into the production
 * PO tables, so COGS cost-averaging (src/lib/cogs) can blend real historical
 * unit costs with ongoing production POs.
 *
 * Source: scripts/shopify-pos.json — parsed from the native Shopify PO PDF
 * exports and reconciled (qty*unitCost==lineTotal per line, Σ(lineTotal)==
 * subtotal, line count==declared count). Shopify exposes no PO API, so the PDFs
 * are the only source for this history.
 *
 * Cost policy (confirmed with the team):
 *   - Volume discounts are PRORATED into unit costs (actual cost paid).
 *   - One-time tooling is EXCLUDED from per-unit cost (capital, not marginal COGS).
 *
 * Imported POs are marked status='complete', origin='shopify_pdf', and both the
 * PO and every line get shopify_received_at set to the issue date — so they
 * count as a recognized cost basis in getAverageUnitCostBySku().
 *
 * Idempotent: re-running deletes and re-inserts only origin='shopify_pdf' rows
 * (cascade removes their line items); native POs are never touched.
 *
 * Usage:
 *   npm run import:shopify-pos            # dry run — prints what it would do
 *   npm run import:shopify-pos -- --apply # write to the database
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { and, eq, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import { productionPo, productionPoLineItem, supplier } from "@/lib/schema";
import { loadCatalog, type CatalogVariant } from "@/lib/catalog/load";

const ORIGIN = "shopify_pdf";

interface JsonLine {
  sku: string;
  qty: number;
  unitCostCents: number;
  lineTotalCents: number;
  note?: string;
}
interface JsonPo {
  po: string;
  issuedDate: string;
  currency: string;
  supplier: string;
  declaredItems: number;
  subtotalCents: number;
  discountCents: number;
  toolingCents: number;
  lineItems: JsonLine[];
}

function load(): JsonPo[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = JSON.parse(readFileSync(join(here, "shopify-pos.json"), "utf8"));
  return raw.purchaseOrders as JsonPo[];
}

/** Re-validate the intermediate before trusting it (defense in depth). */
function validate(pos: JsonPo[]) {
  for (const po of pos) {
    if (po.currency !== "USD") throw new Error(`${po.po}: non-USD currency ${po.currency}`);
    if (po.lineItems.length !== po.declaredItems)
      throw new Error(`${po.po}: ${po.lineItems.length} lines vs declared ${po.declaredItems}`);
    let sum = 0;
    for (const li of po.lineItems) {
      if (Math.round(li.qty * li.unitCostCents) !== li.lineTotalCents)
        throw new Error(`${po.po} ${li.sku}: qty*cost ${li.qty}*${li.unitCostCents} != ${li.lineTotalCents}`);
      sum += li.lineTotalCents;
    }
    if (sum !== po.subtotalCents)
      throw new Error(`${po.po}: line sum ${sum} != subtotal ${po.subtotalCents}`);
  }
}

/** Discount-in, tooling-out: prorate any PO-level discount across unit costs. */
function effectiveUnitCost(po: JsonPo, rawUnitCostCents: number): number {
  if (!po.discountCents || po.subtotalCents <= 0) return rawUnitCostCents;
  const factor = (po.subtotalCents - po.discountCents) / po.subtotalCents;
  return Math.round(rawUnitCostCents * factor);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const pos = load();
  validate(pos);

  // Best-effort catalog enrichment: real titles + Shopify ids by SKU. Falls
  // back to the SKU as title for OEM / discontinued items not in the catalog.
  let bySku = new Map<string, CatalogVariant>();
  try {
    const catalog = await loadCatalog();
    bySku = new Map(catalog.filter((v) => v.sku).map((v) => [v.sku, v]));
  } catch (err) {
    console.warn("catalog load failed — titles fall back to SKU:", err instanceof Error ? err.message : err);
  }

  // One supplier for the whole history (all POs are EPower).
  const supplierName = pos[0].supplier;
  let supplierId: string | null = null;
  const existing = await db
    .select({ id: supplier.id })
    .from(supplier)
    .where(ilike(supplier.name, supplierName))
    .limit(1);
  if (existing[0]) {
    supplierId = existing[0].id;
    console.log(`supplier "${supplierName}" → existing ${supplierId}`);
  } else if (apply) {
    const [row] = await db.insert(supplier).values({ name: supplierName }).returning({ id: supplier.id });
    supplierId = row.id;
    console.log(`supplier "${supplierName}" → created ${supplierId}`);
  } else {
    console.log(`supplier "${supplierName}" → would create`);
  }

  let totalLines = 0;
  for (const po of pos) {
    const received = new Date(`${po.issuedDate}T00:00:00Z`);
    const lines = po.lineItems.map((li) => {
      const cat = bySku.get(li.sku);
      const title = cat
        ? cat.variantTitle
          ? `${cat.title} — ${cat.variantTitle}`
          : cat.title
        : li.sku;
      return {
        sku: li.sku,
        title,
        quantity: li.qty,
        unitCostCents: effectiveUnitCost(po, li.unitCostCents),
        shopifyProductId: cat?.shopifyProductId ?? null,
        shopifyVariantId: cat?.shopifyVariantId ?? null,
      };
    });
    totalLines += lines.length;

    const adj =
      po.discountCents > 0
        ? ` (−${(po.discountCents / 100).toFixed(2)} discount prorated)`
        : po.toolingCents > 0
          ? ` (${(po.toolingCents / 100).toFixed(2)} tooling excluded)`
          : "";
    console.log(`${apply ? "IMPORT" : "DRY  "} ${po.po} ${po.issuedDate} — ${lines.length} lines${adj}`);

    if (!apply) continue;

    // Idempotent: clear any prior import of this PO (cascade drops its lines).
    await db
      .delete(productionPo)
      .where(and(eq(productionPo.origin, ORIGIN), eq(productionPo.shopifyPoNumber, po.po)));

    const [created] = await db
      .insert(productionPo)
      .values({
        supplierId: supplierId!,
        shopifyPoNumber: po.po,
        issuedDate: po.issuedDate,
        status: "complete",
        origin: ORIGIN,
        shopifyReceivedAt: received,
        notes:
          po.toolingCents > 0
            ? `Imported from Shopify PDF. One-time tooling of $${(po.toolingCents / 100).toFixed(2)} excluded from per-unit cost.`
            : "Imported from Shopify PDF.",
      })
      .returning({ id: productionPo.id });

    await db.insert(productionPoLineItem).values(
      lines.map((l) => ({
        poId: created.id,
        sku: l.sku,
        title: l.title,
        quantity: l.quantity,
        unitCostCents: l.unitCostCents,
        shopifyProductId: l.shopifyProductId,
        shopifyVariantId: l.shopifyVariantId,
        shopifyReceivedAt: received,
      })),
    );
  }

  console.log(
    `\n${apply ? "Imported" : "Would import"} ${pos.length} POs / ${totalLines} line items.` +
      (apply ? "" : "  Re-run with -- --apply to write."),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
