// Pure COGS math — no DB imports, so it's unit-testable in isolation.
// The DB-backed loaders (`average-cost.ts`, `cogs.ts`) build on these.

/** A single PO line's contribution to a SKU's average cost. */
export interface CostLine {
  sku: string;
  quantity: number;
  /** Effective per-unit cost in cents, or null when no cost is recorded. */
  unitCostCents: number | null;
}

/** Quantity-weighted average cost for one SKU. */
export interface SkuCost {
  sku: string;
  /** Quantity-weighted average effective unit cost in cents (fractional; round at presentation). */
  avgUnitCostCents: number;
  /** Units across the PO lines that fed the average. */
  unitsCosted: number;
  /** Number of PO lines that contributed. */
  lineCount: number;
}

/**
 * Quantity-weighted average effective unit cost per SKU.
 *
 * weighted avg = Σ(unitCost × qty) / Σ(qty), over lines that actually carry a
 * cost. Lines with a null cost or non-positive quantity can't contribute and
 * are ignored (so a costless line never drags the average toward zero).
 */
export function computeWeightedAvgCost(lines: CostLine[]): Map<string, SkuCost> {
  const acc = new Map<string, { costQty: number; qty: number; lineCount: number }>();
  for (const l of lines) {
    if (l.unitCostCents == null || l.quantity <= 0) continue;
    const a = acc.get(l.sku) ?? { costQty: 0, qty: 0, lineCount: 0 };
    a.costQty += l.unitCostCents * l.quantity;
    a.qty += l.quantity;
    a.lineCount += 1;
    acc.set(l.sku, a);
  }
  const out = new Map<string, SkuCost>();
  for (const [sku, a] of acc) {
    if (a.qty === 0) continue;
    out.set(sku, {
      sku,
      avgUnitCostCents: a.costQty / a.qty,
      unitsCosted: a.qty,
      lineCount: a.lineCount,
    });
  }
  return out;
}

/** Units sold + revenue for one SKU over the reporting window. */
export interface SkuSales {
  sku: string;
  title: string;
  unitsSold: number;
  revenueCents: number;
}

/** Per-SKU COGS line. Cost fields are null when the SKU has no PO cost basis. */
export interface CogsRow extends SkuSales {
  avgUnitCostCents: number | null;
  cogsCents: number | null;
  grossMarginCents: number | null;
  marginPct: number | null;
}

export interface CogsReport {
  rows: CogsRow[];
  totals: {
    /** Revenue across all sold SKUs (costed or not). */
    revenueCents: number;
    /** Revenue from SKUs that have a cost basis — the denominator for margin. */
    costedRevenueCents: number;
    cogsCents: number;
    grossMarginCents: number;
    marginPct: number | null;
  };
  /** Sold SKUs with no PO cost basis — excluded from COGS/margin totals. */
  uncosted: SkuSales[];
}

/**
 * Join per-SKU sales to per-SKU average cost and roll up COGS + margin.
 *
 * SKUs with no cost basis are surfaced in `uncosted` and carry null cost fields
 * — and are kept out of the COGS / gross-margin totals so a missing cost can't
 * silently understate margin. Blended margin is computed on **costed** revenue.
 */
export function computeCogsRows(
  sales: SkuSales[],
  costBySku: Map<string, SkuCost>,
): CogsReport {
  const rows: CogsRow[] = [];
  const uncosted: SkuSales[] = [];

  for (const s of sales) {
    const c = costBySku.get(s.sku);
    if (!c) {
      uncosted.push(s);
      rows.push({
        ...s,
        avgUnitCostCents: null,
        cogsCents: null,
        grossMarginCents: null,
        marginPct: null,
      });
      continue;
    }
    const cogsCents = Math.round(c.avgUnitCostCents * s.unitsSold);
    const grossMarginCents = s.revenueCents - cogsCents;
    const marginPct =
      s.revenueCents > 0 ? (grossMarginCents / s.revenueCents) * 100 : null;
    rows.push({
      ...s,
      avgUnitCostCents: Math.round(c.avgUnitCostCents),
      cogsCents,
      grossMarginCents,
      marginPct,
    });
  }

  rows.sort(
    (a, b) =>
      (b.cogsCents ?? 0) - (a.cogsCents ?? 0) || b.revenueCents - a.revenueCents,
  );

  let revenueCents = 0;
  let costedRevenueCents = 0;
  let cogsCents = 0;
  for (const r of rows) {
    revenueCents += r.revenueCents;
    if (r.cogsCents != null) {
      cogsCents += r.cogsCents;
      costedRevenueCents += r.revenueCents;
    }
  }
  const grossMarginCents = costedRevenueCents - cogsCents;
  const marginPct =
    costedRevenueCents > 0 ? (grossMarginCents / costedRevenueCents) * 100 : null;

  return {
    rows,
    totals: {
      revenueCents,
      costedRevenueCents,
      cogsCents,
      grossMarginCents,
      marginPct,
    },
    uncosted,
  };
}
