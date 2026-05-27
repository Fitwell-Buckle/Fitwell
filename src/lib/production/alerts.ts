import type { ProductionStage } from "./stages";

// Pure, DB-free selectors for the production deadline-alerts cron. Dates are
// YYYY-MM-DD strings, which sort lexicographically == chronologically.

/** Add `n` days to a YYYY-MM-DD date (UTC), returning a YYYY-MM-DD string. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface AlertLine {
  id: string;
  sku: string;
  title: string;
  currentStage: ProductionStage;
  /** Effective due date: line's expected completion, else the PO's expected delivery. */
  dueDate: string | null;
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  supplierEmail: string | null;
}

export type DueLine = AlertLine & { overdue: boolean };

/**
 * Line items that need a deadline alert: not yet complete, with a known due
 * date that falls on or before `today + withinDays` (this includes already
 * overdue lines). Each result is flagged `overdue` when its due date is in the
 * past relative to `today`.
 */
export function lineItemsNeedingAlert(params: {
  lineItems: AlertLine[];
  today: string;
  withinDays: number;
  /** The terminal stage key (a line there is done). Defaults to the seeded key. */
  terminal?: string;
}): DueLine[] {
  const terminal = params.terminal ?? "complete";
  const cutoff = addDays(params.today, params.withinDays);
  return params.lineItems
    .filter((li) => li.currentStage !== terminal && li.dueDate !== null && li.dueDate <= cutoff)
    .map((li) => ({ ...li, overdue: (li.dueDate as string) < params.today }));
}

export interface NagPo {
  id: string;
  poNumber: string;
  lineStages: ProductionStage[];
  receivedAt: Date | null;
}

/**
 * POs that are fully complete (every line at the complete stage) but haven't
 * been received into Shopify yet — these get a "ready to receive" nag.
 */
export function posNeedingReceiveNag(
  pos: NagPo[],
  terminal: string = "complete",
): { id: string; poNumber: string }[] {
  return pos
    .filter(
      (po) =>
        !po.receivedAt &&
        po.lineStages.length > 0 &&
        po.lineStages.every((s) => s === terminal),
    )
    .map((po) => ({ id: po.id, poNumber: po.poNumber }));
}
