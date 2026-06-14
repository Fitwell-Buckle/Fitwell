"use client";

import {
  colQty,
  editableSum,
  remainderQty,
  isRowOverAllocated,
  type SplitLocation,
  type Alloc,
} from "@/lib/invoicing/split-alloc";

/**
 * Minimal saved-address shape the grid needs — just an id + the label fields.
 * Kept local (not tied to the DB `CompanyAddress`) so this UI component is
 * entity-agnostic: B2B passes company addresses, the influencer side passes a
 * linked Shopify customer's addresses. Both are structurally assignable.
 */
export interface AddressOption {
  id: string;
  name?: string | null;
  company?: string | null;
  address1?: string | null;
  city?: string | null;
  province?: string | null;
  provinceCode?: string | null;
  zip?: string | null;
}

/** One-line label for a saved address (shared by every order form). */
export function addressOptionLabel(a: AddressOption): string {
  return [a.name || a.company, a.address1, a.city, a.provinceCode ?? a.province, a.zip]
    .filter(Boolean)
    .join(", ");
}

export interface SplitGridLine {
  shopifyVariantId: string;
  sku: string;
  label: string;
  total: number;
}

/**
 * Split-fulfillment grid: SKU rows × location columns + a read-only Total column.
 * Every column is an editable quantity except the LAST, which shows each SKU's
 * remainder (total − Σ others) automatically. Location 0 is the order's default
 * ship-to (managed by the form's own select, not removable here); added columns
 * carry a remove (×). Shared verbatim by the portal order form and the admin
 * invoice form so the two stay identical.
 */
export function SplitFulfillmentGrid({
  lines,
  addresses,
  locations,
  alloc,
  onSetCell,
  onAddLocation,
  onRemoveLocation,
}: {
  lines: SplitGridLine[];
  addresses: AddressOption[];
  locations: SplitLocation[];
  alloc: Alloc;
  onSetCell: (variantId: string, addressId: string, qty: number) => void;
  onAddLocation: (addressId: string) => void;
  onRemoveLocation: (addressId: string) => void;
}) {
  const usedIds = new Set(locations.map((l) => l.addressId));
  const available = addresses.filter((a) => !usedIds.has(a.id));
  const lastIdx = locations.length - 1;

  return (
    <div className="mt-4 border-t border-zinc-100 pt-4">
      <p className="mb-2 text-xs font-medium text-zinc-500">
        Split quantities by location — the last column fills in the balance automatically.
      </p>

      {locations.length < 2 ? (
        <p className="text-sm text-zinc-500">
          Add a second location below to split this order across addresses.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-400">
                <th className="py-2 pr-3 font-medium">Product</th>
                {locations.map((loc, i) => (
                  <th
                    key={loc.addressId}
                    className="px-2 py-2 text-right align-bottom font-medium"
                  >
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="flex items-center gap-1">
                        {i >= 1 && (
                          <button
                            type="button"
                            onClick={() => onRemoveLocation(loc.addressId)}
                            className="text-zinc-300 hover:text-red-500"
                            aria-label="Remove location"
                          >
                            ×
                          </button>
                        )}
                        <span
                          className="max-w-[160px] truncate normal-case text-zinc-600"
                          title={loc.label}
                        >
                          {loc.label}
                        </span>
                      </span>
                      {i === lastIdx && <span className="text-[10px] text-zinc-400">(auto)</span>}
                    </div>
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const ed = editableSum(alloc, l.shopifyVariantId, locations);
                const over = isRowOverAllocated(l.total, ed);
                const rem = remainderQty(l.total, ed);
                return (
                  <tr key={l.shopifyVariantId} className="border-t border-zinc-100 align-top">
                    <td className="py-2 pr-3 text-zinc-700">
                      <div className="max-w-[260px]">{l.label}</div>
                      {over && (
                        <div className="mt-0.5 text-xs text-red-600">
                          Allocated more than the {l.total} ordered.
                        </div>
                      )}
                    </td>
                    {locations.map((loc, i) => (
                      <td key={loc.addressId} className="px-2 py-2 text-right">
                        {i === lastIdx ? (
                          <span className="inline-block w-16 tabular-nums text-zinc-500">{rem}</span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            value={String(colQty(alloc, l.shopifyVariantId, loc.addressId))}
                            onChange={(e) =>
                              onSetCell(
                                l.shopifyVariantId,
                                loc.addressId,
                                Math.max(0, Math.floor(Number(e.target.value) || 0)),
                              )
                            }
                            className={`h-9 w-16 rounded-md border bg-white px-2 text-right text-sm tabular-nums focus-visible:outline-none focus-visible:ring-1 ${
                              over
                                ? "border-red-300 focus-visible:ring-red-300"
                                : "border-zinc-200 focus-visible:ring-zinc-300"
                            }`}
                          />
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right tabular-nums text-zinc-700">{l.total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {available.length > 0 && (
        <div className="mt-3">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onAddLocation(e.target.value);
            }}
            className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300"
          >
            <option value="">+ Add location…</option>
            {available.map((a) => (
              <option key={a.id} value={a.id}>
                {addressOptionLabel(a)}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
