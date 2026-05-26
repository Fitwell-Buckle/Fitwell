// Pure, DB-free "raw blank" summarization for sub-POs.
//
// Domain rule: all SKUs of a given size + material share the same raw stamped
// blank — colour/finish only diverges from the polishing stage onward. So a
// supplier working the pre-polishing stages (stamping / EDM) doesn't care about
// colour: 100 gold + 100 black 16mm steel buckles are 200 × "16mm Steel" blanks
// to them. This summarizes a sub-PO's line items accordingly.

import type { ProductionStage } from "./stages";

// Stages before polishing — only size + material matter (identical raw blank).
export const RAW_BLANK_STAGES: ProductionStage[] = ["supplier_po", "stamping", "edm"];

/**
 * Whether a sub-PO should be summarized as raw blanks: true when the supplier
 * owns *only* pre-polishing stages (so finish/colour is irrelevant to them).
 * A supplier who also owns polishing or later needs the per-SKU detail.
 */
export function usesRawBlankSummary(stages: ProductionStage[]): boolean {
  const raw = new Set<ProductionStage>(RAW_BLANK_STAGES);
  return stages.length > 0 && stages.every((s) => raw.has(s));
}

export interface RawBlankInput {
  sku: string;
  quantity: number;
  sizeMm: number | null;
  material: string | null;
}

export interface RawBlankGroup {
  /** Display label, e.g. "16mm Steel" (or the SKU when size/material unknown). */
  label: string;
  sizeMm: number | null;
  material: string | null;
  quantity: number;
  /** The finished SKUs this blank covers, for reference on the PO. */
  skus: string[];
}

/**
 * Group line items into raw blanks by (size, material), summing quantities.
 * Items whose size or material can't be resolved stay on their own (keyed by
 * SKU) so nothing is wrongly merged. Sorted by size then material.
 */
export function summarizeRawBlanks(items: RawBlankInput[]): RawBlankGroup[] {
  const groups = new Map<string, RawBlankGroup>();
  for (const it of items) {
    const canGroup = it.sizeMm != null && !!it.material;
    const key = canGroup ? `s${it.sizeMm}|${it.material}` : `sku:${it.sku}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        label: canGroup ? `${it.sizeMm}mm ${it.material}` : it.sku,
        sizeMm: it.sizeMm,
        material: it.material,
        quantity: 0,
        skus: [],
      };
      groups.set(key, g);
    }
    g.quantity += it.quantity;
    if (!g.skus.includes(it.sku)) g.skus.push(it.sku);
  }
  return [...groups.values()].sort(
    (a, b) =>
      (a.sizeMm ?? Number.MAX_SAFE_INTEGER) - (b.sizeMm ?? Number.MAX_SAFE_INTEGER) ||
      (a.material ?? "").localeCompare(b.material ?? ""),
  );
}
