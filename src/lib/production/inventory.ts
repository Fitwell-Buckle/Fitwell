import type { ProductionStage } from "./stages";
import { projectEta } from "./cycle-time";
import { skuSize } from "./display";

// Pure aggregation of in-production (not-yet-received) line items into per-SKU
// "incoming" inventory: total quantity, a per-stage breakdown, and the nearest
// projected ETA. DB-free so it's unit-tested directly.

export interface IncomingLine {
  sku: string;
  title: string;
  quantity: number;
  currentStage: ProductionStage;
  /** Per-line stage list — `null`/`undefined` inherits the global pipeline.
   *  When set, `projectEta` walks this list (so a line that skips stages
   *  isn't projected through them). */
  stages?: readonly string[] | null;
}

export interface IncomingRow {
  sku: string;
  title: string;
  incomingQty: number;
  byStage: Partial<Record<ProductionStage, number>>;
  /** Soonest projected completion across this SKU's lines (YYYY-MM-DD), or null. */
  nearestEta: string | null;
}

/** An incoming line tagged with its owning (sub-)PO, for the "by PO" view. */
export interface IncomingPoLine extends IncomingLine {
  /** Display number of the owning sub-PO (or standalone PO). */
  poNumber: string;
  /** id of the PO whose detail page this row links to. */
  poId: string;
  supplier: string;
  /** Owning master-PO status (open/fulfilled/cancelled/…) — surfaced so the
   * by-PO table can show a status badge alongside the in-flight inventory.
   * Lines that share a poNumber are assumed to share a status. */
  status: string;
}

export interface IncomingPoRow {
  poNumber: string;
  poId: string;
  supplier: string;
  status: string;
  incomingQty: number;
  byStage: Partial<Record<ProductionStage, number>>;
  nearestEta: string | null;
}

/**
 * Same incoming inventory as `aggregateIncoming`, but grouped by the owning
 * (sub-)PO instead of by SKU — for the POs & Production "by PO" view.
 */
export function aggregateIncomingByPo(
  order: readonly string[],
  lines: IncomingPoLine[],
  estimates: Record<ProductionStage, number>,
  today: string,
): IncomingPoRow[] {
  const byPo = new Map<string, IncomingPoRow>();

  for (const li of lines) {
    const row =
      byPo.get(li.poNumber) ??
      ({
        poNumber: li.poNumber,
        poId: li.poId,
        supplier: li.supplier,
        status: li.status,
        incomingQty: 0,
        byStage: {},
        nearestEta: null,
      } satisfies IncomingPoRow);

    row.incomingQty += li.quantity;
    row.byStage[li.currentStage] = (row.byStage[li.currentStage] ?? 0) + li.quantity;

    const eta = projectEta(
      li.stages && li.stages.length > 0 ? li.stages : order,
      li.currentStage,
      today,
      estimates,
    );
    if (row.nearestEta === null || eta < row.nearestEta) row.nearestEta = eta;

    byPo.set(li.poNumber, row);
  }

  return [...byPo.values()].sort((a, b) => a.poNumber.localeCompare(b.poNumber));
}

export function aggregateIncoming(
  order: readonly string[],
  lines: IncomingLine[],
  estimates: Record<ProductionStage, number>,
  today: string,
): IncomingRow[] {
  const bySku = new Map<string, IncomingRow>();

  for (const li of lines) {
    const row =
      bySku.get(li.sku) ??
      ({
        sku: li.sku,
        title: li.title,
        incomingQty: 0,
        byStage: {},
        nearestEta: null,
      } satisfies IncomingRow);

    row.incomingQty += li.quantity;
    row.byStage[li.currentStage] = (row.byStage[li.currentStage] ?? 0) + li.quantity;

    const eta = projectEta(
      li.stages && li.stages.length > 0 ? li.stages : order,
      li.currentStage,
      today,
      estimates,
    );
    if (row.nearestEta === null || eta < row.nearestEta) row.nearestEta = eta;

    bySku.set(li.sku, row);
  }

  return [...bySku.values()].sort(
    (a, b) => skuSize(a.sku) - skuSize(b.sku) || a.sku.localeCompare(b.sku),
  );
}
