"use client";

import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtMoney } from "@/lib/production/display";

const headerLabel = "text-[11px] font-medium uppercase tracking-wider text-zinc-400";

/**
 * Column headers for the line-items table — rendered ONCE above the rows so the
 * labels aren't repeated on every line. Column widths match `LineItemRow`.
 * Shared by the admin invoice form and the B2B portal order form.
 */
export function LineItemsHeader() {
  return (
    <div className="flex items-center gap-2 border-b border-zinc-100 px-0 pb-2">
      <div className={`min-w-[200px] flex-1 ${headerLabel}`}>Product</div>
      <div className={`w-20 ${headerLabel}`}>Qty</div>
      <div className={`w-28 ${headerLabel}`}>Unit price</div>
      <div className={`w-24 px-2 text-right ${headerLabel}`}>Unit discount</div>
      <div className={`w-28 px-2 text-right ${headerLabel}`}>Line total</div>
      <div className="w-10" />
    </div>
  );
}

/**
 * One line-item row. The variable cells (product picker, qty, unit price) are
 * slotted because they differ (the admin edits them; the customer sees
 * read-only catalog pricing); the column layout, the computed unit-discount +
 * line-total cells, and the remove button are shared. Render `LineItemsHeader`
 * above a list of these. Edit this and both surfaces change together.
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
    <div className="flex items-center gap-2">
      <div className="min-w-[200px] flex-1">{product}</div>
      <div className="w-20">{qty}</div>
      <div className="w-28">{unitPrice}</div>
      <div className="flex h-10 w-24 items-center justify-end px-2 text-sm font-medium tabular-nums text-zinc-500">
        {unitDiscountCents == null ? (
          <span className="text-zinc-300">—</span>
        ) : unitDiscountCents === 0 ? (
          <span className="text-zinc-300">$0.00</span>
        ) : (
          `−${fmtMoney(unitDiscountCents)}`
        )}
      </div>
      <div className="flex h-10 w-28 items-center justify-end px-2 text-sm font-medium tabular-nums text-zinc-700">
        {lineTotalCents == null ? (
          <span className="text-zinc-300">—</span>
        ) : (
          fmtMoney(lineTotalCents)
        )}
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
