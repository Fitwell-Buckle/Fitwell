/**
 * Standard (estimated) unit costs, used as a COGS fallback for SKUs that have no
 * recognized production-PO cost yet. Costs set by Tom (2026-06-30):
 *
 *   stainless buckle (any finish — silver/gold/black/bead-blast) … $3.60
 *   titanium buckle (incl. bead-blasted titanium)                 … $4.50
 *   tang                                                          … $1.00
 *   spring bar                                                    … $0.01
 *   bundle                                                        … 3 × the blended
 *                                                                   buckle cost of its material
 *
 * Classification is driven by the product TITLE, not the SKU code, because the
 * codes are inconsistent — e.g. "-SB-" is a bead-blasted *buckle* in
 * FWB001-SB-18 but a *spring bar* in FWB001SB16. Material falls back to the SKU
 * finish code only when the title/variant carry no material word (some bundle
 * variants read just "Silver").
 *
 * These are ESTIMATES for margin analysis; recognized PO cost (received/paid)
 * always takes precedence. See src/lib/margin/true-margin.ts.
 */
export const STANDARD_COST_CENTS = {
  buckleStainless: 360,
  buckleTitanium: 450,
  tang: 100,
  springBar: 1,
} as const;

export type SkuMaterial = "stainless" | "titanium" | null;

/** Material from product text, falling back to the SKU finish code. */
export function detectMaterial(
  title: string | null | undefined,
  variant: string | null | undefined,
  sku: string | null | undefined,
): SkuMaterial {
  const text = `${title ?? ""} ${variant ?? ""}`.toLowerCase();
  const s = (sku ?? "").toLowerCase();
  if (/titanium/.test(text) || /-ti-|-tb-|\bti\d|\btb\d/.test(s)) return "titanium";
  if (/stainless|316l/.test(text) || /-ss-|-yg-|-rg-|-bl-|-sb-|\bss\d|\byg\d|\brg\d|\bbl\d/.test(s))
    return "stainless";
  return null;
}

function buckleCost(material: SkuMaterial): number | null {
  if (material === "titanium") return STANDARD_COST_CENTS.buckleTitanium;
  if (material === "stainless") return STANDARD_COST_CENTS.buckleStainless;
  return null;
}

/**
 * Standard unit cost (cents) for a sold SKU, or null if it can't be classified.
 * Order matters: accessories are matched before buckles (a titanium *tang* is
 * still $1, not the titanium buckle price), and bundles before plain buckles.
 */
export function standardUnitCostCents(
  title: string | null | undefined,
  variant: string | null | undefined,
  sku: string | null | undefined,
): number | null {
  const t = (title ?? "").toLowerCase();
  const s = (sku ?? "").toLowerCase();

  if (/spring\s*bar/.test(t)) return STANDARD_COST_CENTS.springBar;
  if (/\btang\b/.test(t)) return STANDARD_COST_CENTS.tang;

  const material = detectMaterial(title, variant, sku);
  const base = buckleCost(material);

  // Bundle = three buckles of its material.
  if (/bundle/.test(t) || /-bun$|\bbun$/.test(s)) {
    return base != null ? base * 3 : null;
  }

  return base; // plain buckle, by material (null if material unknown)
}
