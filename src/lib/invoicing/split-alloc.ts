import type { InvoiceShipTo } from "@/lib/schema";

// ── Split-fulfillment quantity allocation ────────────────────────────────────
//
// "Split fulfillment" distributes each SKU's total quantity across several saved
// ship-to addresses ("locations"). The UI is a grid: SKU rows × location columns
// + a Total column. The user types a quantity into every location column EXCEPT
// the last; the last column shows each SKU's remainder (total − Σ others) and is
// read-only ("auto-balanced").
//
// On save, an allocation expands into one stored invoice line per (SKU, location)
// with qty > 0, each carrying that location's address as its per-line ship-to —
// the shape the rest of the pipeline already understands (createInvoice /
// savePortalOrderLines, buildSplitShipping, buildShipPlan). On edit, the stored
// lines reconstruct back into the grid. These helpers are pure + framework-free
// so both the portal order form and the admin invoice form share identical logic.

/** A destination column in the grid. `addressId` is the company address id. */
export type SplitLocation = { addressId: string; label: string };

/**
 * Editable per-column quantities: variantId → (addressId → qty). Only the
 * editable (non-last) columns are stored here; the last column is always the
 * computed remainder, never persisted in the map.
 */
export type Alloc = Record<string, Record<string, number>>;

/** Minimal cart line the allocation needs: a variant key + its total quantity. */
export type AllocLine = { shopifyVariantId: string; total: number };

/** One expanded line, ready to fold into a form's line-item payload. */
export type ExpandedLine = {
  shopifyVariantId: string;
  quantity: number;
  /** The location's address id; `undefined` in the non-split fallback. */
  addressId: string | undefined;
};

export function colQty(alloc: Alloc, variantId: string, addressId: string): number {
  return alloc[variantId]?.[addressId] ?? 0;
}

/** Sum of the editable (non-last) columns for one SKU. */
export function editableSum(
  alloc: Alloc,
  variantId: string,
  locations: SplitLocation[],
): number {
  let sum = 0;
  for (let i = 0; i < locations.length - 1; i++) {
    sum += colQty(alloc, variantId, locations[i].addressId);
  }
  return sum;
}

/** The auto-balanced last-column quantity for one SKU (never negative). */
export function remainderQty(total: number, editable: number): number {
  return Math.max(0, total - editable);
}

/** A SKU is over-allocated when its editable columns already exceed its total. */
export function isRowOverAllocated(total: number, editable: number): boolean {
  return editable > total;
}

/** Any SKU over-allocated? Used to gate save. Never true below 2 locations. */
export function anyOverAllocated(
  lines: AllocLine[],
  locations: SplitLocation[],
  alloc: Alloc,
): boolean {
  if (locations.length < 2) return false;
  return lines.some((l) =>
    isRowOverAllocated(l.total, editableSum(alloc, l.shopifyVariantId, locations)),
  );
}

/**
 * Expand a grid allocation into per-(SKU, location) lines. With fewer than 2
 * locations there's nothing to split, so each SKU becomes a single line with no
 * address (ships to the order's default). Otherwise every editable column with
 * qty > 0 emits a line, and each SKU's remainder goes to the last location.
 */
export function expandAlloc(
  lines: AllocLine[],
  locations: SplitLocation[],
  alloc: Alloc,
): ExpandedLine[] {
  if (locations.length < 2) {
    return lines.map((l) => ({
      shopifyVariantId: l.shopifyVariantId,
      quantity: l.total,
      addressId: undefined,
    }));
  }

  const last = locations[locations.length - 1];
  const out: ExpandedLine[] = [];
  for (const l of lines) {
    let used = 0;
    for (let i = 0; i < locations.length - 1; i++) {
      const loc = locations[i];
      const q = colQty(alloc, l.shopifyVariantId, loc.addressId);
      if (q > 0) {
        out.push({ shopifyVariantId: l.shopifyVariantId, quantity: q, addressId: loc.addressId });
        used += q;
      }
    }
    const rem = remainderQty(l.total, used);
    if (rem > 0) {
      out.push({ shopifyVariantId: l.shopifyVariantId, quantity: rem, addressId: last.addressId });
    }
  }
  return out;
}

/** A stored line as seen on edit — the fields reconstruction reads. */
export type StoredAllocLine = {
  shopifyVariantId: string | null;
  quantity: number;
  shipTo: InvoiceShipTo | null;
};

/**
 * Rebuild grid state from an order's stored lines. Groups lines by variant to
 * recover each SKU's total, derives the ordered location set (the order's
 * default address first, then each line's ship-to in first-seen order), and
 * fills the allocation map. Backward compatible with old-model orders (one line
 * per SKU with a single per-line address → that SKU sits wholly in one column).
 *
 * Returns location *ids* only; the caller maps them to labels with its address
 * list (keeps this module free of UI/label concerns).
 */
export function reconstructAlloc(
  lines: StoredAllocLine[],
  orderDefaultAddressId: string | undefined,
): { locationIds: string[]; alloc: Alloc; totalsByVariant: Record<string, number> } {
  const totalsByVariant: Record<string, number> = {};
  const alloc: Alloc = {};
  const locationIds: string[] = [];
  const pushId = (id: string) => {
    if (id && !locationIds.includes(id)) locationIds.push(id);
  };

  // Default column is always first when the order has one.
  if (orderDefaultAddressId) pushId(orderDefaultAddressId);

  for (const l of lines) {
    if (!l.shopifyVariantId) continue;
    totalsByVariant[l.shopifyVariantId] =
      (totalsByVariant[l.shopifyVariantId] ?? 0) + l.quantity;
    const aid = l.shipTo?.addressId ?? orderDefaultAddressId;
    if (!aid) continue;
    pushId(aid);
    (alloc[l.shopifyVariantId] ??= {})[aid] =
      (alloc[l.shopifyVariantId]?.[aid] ?? 0) + l.quantity;
  }

  return { locationIds, alloc, totalsByVariant };
}
