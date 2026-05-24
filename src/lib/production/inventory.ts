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
}

export interface IncomingRow {
  sku: string;
  title: string;
  incomingQty: number;
  byStage: Partial<Record<ProductionStage, number>>;
  /** Soonest projected completion across this SKU's lines (YYYY-MM-DD), or null. */
  nearestEta: string | null;
}

export function aggregateIncoming(
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

    const eta = projectEta(li.currentStage, today, estimates);
    if (row.nearestEta === null || eta < row.nearestEta) row.nearestEta = eta;

    bySku.set(li.sku, row);
  }

  return [...bySku.values()].sort(
    (a, b) => skuSize(a.sku) - skuSize(b.sku) || a.sku.localeCompare(b.sku),
  );
}
