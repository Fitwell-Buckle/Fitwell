"use client";

import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtMoney } from "@/lib/production/display";

// Shared uppercase column label for a line-item row. One definition so the
// admin invoice form and the B2B portal order form read identically.
export const lineRowLabel =
  "mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-400";

/**
 * One line-item row — the shared visual language for the admin invoice form and
 * the B2B portal order form. The variable cells (product picker, qty, unit
 * price) are slotted because they differ (the admin edits them; the customer
 * sees read-only catalog pricing); the labels, the computed unit-discount +
 * line-total cells, the remove button, and the layout are shared. Edit this and
 * both surfaces change together.
 */
export function LineItemRow({
  product,
  qty,
  unitPrice,
  unitDiscountCents,
  lineTotalCents,
  onRemove,
  removeDisabled = false,
}: {
  product: ReactNode;
  qty: ReactNode;
  unitPrice: ReactNode;
  /** Per-unit discount (retail unit − net unit). null = not computable yet. */
  unitDiscountCents: number | null;
  /** Net line total (after partner-tier discount). null = not computable yet. */
  lineTotalCents: number | null;
  onRemove: () => void;
  removeDisabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[200px] flex-1">
        <label className={lineRowLabel}>Product</label>
        {product}
      </div>
      <div>
        <label className={lineRowLabel}>QTY</label>
        {qty}
      </div>
      <div>
        <label className={lineRowLabel}>Unit price</label>
        {unitPrice}
      </div>
      <div>
        <label className={lineRowLabel}>Unit discount</label>
        <div className="flex h-10 w-24 items-center justify-end px-2 text-sm font-medium tabular-nums text-zinc-500">
          {unitDiscountCents == null ? (
            <span className="text-zinc-300">—</span>
          ) : unitDiscountCents === 0 ? (
            <span className="text-zinc-300">$0.00</span>
          ) : (
            `−${fmtMoney(unitDiscountCents)}`
          )}
        </div>
      </div>
      <div>
        <label className={lineRowLabel}>Line total</label>
        <div className="flex h-10 w-28 items-center justify-end px-2 text-sm font-medium tabular-nums text-zinc-700">
          {lineTotalCents == null ? (
            <span className="text-zinc-300">—</span>
          ) : (
            fmtMoney(lineTotalCents)
          )}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={removeDisabled}
        aria-label="Remove line"
        className="shrink-0"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

/**
 * The line-items total footer — line totals are already net, so we show just
 * the partner-pricing note + the final Total. Shared by both surfaces.
 */
export function LineItemsTotal({
  discountPercent,
  totalCents,
}: {
  discountPercent: number;
  totalCents: number;
}) {
  return (
    <div className="mt-4 space-y-1 border-t border-zinc-100 pt-3 text-sm">
      {discountPercent > 0 && (
        <div className="flex justify-end gap-6 text-zinc-400">
          <span>Includes {discountPercent}% partner pricing</span>
        </div>
      )}
      <div className="flex justify-end gap-6 font-semibold text-zinc-900">
        <span>Total (USD)</span>
        <span className="w-28 text-right">{fmtMoney(totalCents)}</span>
      </div>
    </div>
  );
}
