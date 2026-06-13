"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ProductCombobox,
  variantLabel,
  type CatalogVariant,
  type CatalogCollection,
} from "@/components/catalog/product-combobox";
import { computeInvoiceTotals, netLineDisplays } from "@/lib/invoicing/invoicing";
import { fmtMoney } from "@/lib/production/display";
import { LineItemRow, LineItemsHeader, LineItemsTotal } from "@/components/invoicing/line-item-row";
import {
  SplitFulfillmentGrid,
  addressOptionLabel,
} from "@/components/invoicing/split-fulfillment-grid";
import {
  expandAlloc,
  reconstructAlloc,
  anyOverAllocated,
  type SplitLocation,
  type Alloc,
} from "@/lib/invoicing/split-alloc";
import type { CompanyAddress } from "@/lib/portal/addresses";

interface CartLine {
  variant: CatalogVariant;
  quantity: number;
}

// A previously-saved order's line, used to seed the cart when editing.
export interface InitialItem {
  shopifyProductId: string | null;
  shopifyVariantId: string;
  sku: string;
  title: string;
  unitPriceCents: number;
  quantity: number;
  /** The line's stored per-line ship-to address id (split fulfillment). */
  addressId?: string;
}


type Action = "save" | "card" | "wire";

// Group saved lines by variant — a split order has one stored line per
// (SKU, destination), so the cart needs each SKU once with its total quantity.
function seedCart(items: InitialItem[]): CartLine[] {
  const byVariant = new Map<string, CartLine>();
  for (const it of items) {
    const existing = byVariant.get(it.shopifyVariantId);
    if (existing) {
      existing.quantity += it.quantity;
      continue;
    }
    byVariant.set(it.shopifyVariantId, {
      quantity: it.quantity,
      variant: {
        shopifyProductId: it.shopifyProductId ?? "",
        shopifyVariantId: it.shopifyVariantId,
        sku: it.sku,
        title: it.title,
        variantTitle: null,
        priceCents: it.unitPriceCents,
        sizeMm: null,
        color: null,
        material: null,
      },
    });
  }
  return [...byVariant.values()];
}

// Seed split-fulfillment grid state from the stored lines (each carries a
// per-line ship-to address id). Default column = the order's primary ship-to.
function seedSplit(items: InitialItem[], defaultAddressId: string | undefined) {
  const lines = items.map((it) => ({
    shopifyVariantId: it.shopifyVariantId,
    quantity: it.quantity,
    shipTo: it.addressId ? { addressId: it.addressId } : null,
  }));
  const isSplit = lines.some((l) => l.shipTo != null);
  const { locationIds, alloc } = reconstructAlloc(lines, defaultAddressId);
  return { isSplit, locationIds, alloc };
}

export function PortalOrder({
  variants,
  collections,
  discountPercent,
  allowWirePayment,
  addresses = [],
  initialAddressId,
  orderId,
  status,
  paymentMethod,
  initialItems = [],
}: {
  variants: CatalogVariant[];
  collections: CatalogCollection[];
  discountPercent: number;
  allowWirePayment: boolean;
  /** The company's saved Shopify addresses for the ship-to picker. */
  addresses?: CompanyAddress[];
  /** Pre-selected ship-to address id (edit mode — the order's stored ship-to). */
  initialAddressId?: string;
  /** Set when editing an existing order; omitted for a brand-new order. */
  orderId?: string;
  /** The existing order's status (edit mode). */
  status?: "draft" | "sent";
  /** The existing order's payment method (edit mode, used to regenerate). */
  paymentMethod?: "card" | "wire";
  initialItems?: InitialItem[];
}) {
  const router = useRouter();
  const isEdit = !!orderId;
  const isSent = status === "sent";

  // Default ship-to, then the split-fulfillment grid state seeded from the order.
  const defaultGuess =
    initialAddressId || addresses.find((a) => a.isDefault)?.id || "";
  const seeded = useMemo(
    () => seedSplit(initialItems, defaultGuess || undefined),
    // Seed once from the initial props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [cart, setCart] = useState<CartLine[]>(seedCart(initialItems));
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ship-to: the order's default destination (split-grid column 0).
  const [addressId, setAddressId] = useState<string>(
    defaultGuess || seeded.locationIds[0] || "",
  );
  // Split fulfillment: when on, quantities are distributed across locations.
  const [split, setSplit] = useState<boolean>(seeded.isSplit);
  // Extra destination columns beyond the default; the default is always col 0.
  const [extraIds, setExtraIds] = useState<string[]>(
    seeded.locationIds.filter((id) => id && id !== (defaultGuess || seeded.locationIds[0])),
  );
  const [alloc, setAlloc] = useState<Alloc>(seeded.alloc);

  const inCart = new Set(cart.map((l) => l.variant.shopifyVariantId));

  // Ordered grid columns: the default ship-to first, then the added locations.
  const locations: SplitLocation[] = useMemo(() => {
    const ids = [addressId, ...extraIds].filter(
      (id, i, arr) => id && arr.indexOf(id) === i,
    );
    return ids.map((id) => {
      const a = addresses.find((x) => x.id === id);
      return { addressId: id, label: a ? addressOptionLabel(a) : id };
    });
  }, [addressId, extraIds, addresses]);

  const overAllocated =
    split &&
    locations.length >= 2 &&
    anyOverAllocated(
      cart.map((l) => ({
        shopifyVariantId: l.variant.shopifyVariantId,
        total: Math.max(0, l.quantity || 0),
      })),
      locations,
      alloc,
    );

  function add(v: CatalogVariant) {
    setError(null);
    setCart((c) =>
      c.some((l) => l.variant.shopifyVariantId === v.shopifyVariantId)
        ? c
        : [...c, { variant: v, quantity: 1 }],
    );
  }
  function addMany(vs: CatalogVariant[]) {
    setError(null);
    setCart((c) => {
      const have = new Set(c.map((l) => l.variant.shopifyVariantId));
      const next = [...c];
      for (const v of vs) {
        if (!have.has(v.shopifyVariantId)) {
          next.push({ variant: v, quantity: 1 });
          have.add(v.shopifyVariantId);
        }
      }
      return next;
    });
  }
  function setQty(id: string, qty: number) {
    setCart((c) => c.map((l) => (l.variant.shopifyVariantId === id ? { ...l, quantity: qty } : l)));
  }
  function remove(id: string) {
    setCart((c) => c.filter((l) => l.variant.shopifyVariantId !== id));
  }
  function setCell(variantId: string, aId: string, qty: number) {
    setAlloc((a) => ({ ...a, [variantId]: { ...a[variantId], [aId]: qty } }));
  }
  function addLocation(id: string) {
    setExtraIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }
  function removeLocation(id: string) {
    setExtraIds((prev) => prev.filter((x) => x !== id));
  }

  const totals = computeInvoiceTotals(
    cart.map((l) => ({ quantity: Math.max(0, l.quantity || 0), unitPriceCents: l.variant.priceCents })),
    discountPercent,
  );
  // Per-line net unit + line total (after the tier discount) — the SAME helper
  // the admin invoice form uses, so the columns reconcile to the total identically.
  const netLines = netLineDisplays(
    cart.map((l) => ({ quantity: Math.max(0, l.quantity || 0), unitPriceCents: l.variant.priceCents })),
    discountPercent,
    totals.totalCents,
  );

  async function send(action: Action) {
    if (cart.length === 0 || overAllocated) return;
    setBusy(action);
    setError(null);
    // Split with ≥2 locations → expand each SKU into one line per destination;
    // otherwise one line per SKU shipping to the default.
    const useSplit = split && locations.length >= 2;
    const lineItems = useSplit
      ? expandAlloc(
          cart.map((l) => ({
            shopifyVariantId: l.variant.shopifyVariantId,
            total: Math.max(1, l.quantity || 1),
          })),
          locations,
          alloc,
        )
      : cart.map((l) => ({
          shopifyVariantId: l.variant.shopifyVariantId,
          quantity: l.quantity,
          addressId: undefined,
        }));
    try {
      const res = await fetch(isEdit ? `/api/portal/orders/${orderId}` : "/api/portal/orders", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submit: action === "save" ? undefined : action,
          addressId,
          lineItems,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Something went wrong.");
        setBusy(null);
        return;
      }
      handleSuccess(action, d.data ?? {});
    } catch {
      setError("Network error — please try again.");
      setBusy(null);
    }
  }

  function handleSuccess(action: Action, data: Record<string, unknown>) {
    if (data.status === "draft") {
      if (!isEdit) {
        // New draft saved — continue editing it on its own page.
        router.push(`/portal/orders/${data.invoiceId as string}`);
      } else {
        toast.success("Draft saved.");
        router.refresh();
        setBusy(null);
      }
      return;
    }
    // Submitted → open the printable invoice (pay link + bank-wire info live
    // there, with Print / Save PDF). The detail page shows the invoice document
    // for any submitted order.
    router.push(`/portal/orders/${data.invoiceId as string}`);
  }

  return (
    <Card className="mt-6 p-6">
      <div className="flex items-center gap-2">
        <ProductCombobox
          variants={variants}
          collections={collections}
          value=""
          exclude={inCart}
          placeholder="Search products to add…"
          onSelect={add}
          onSelectMany={addMany}
        />
      </div>

      <div className="mt-4">
        {cart.length === 0 ? (
          <p className="text-sm text-zinc-400">Your cart is empty. Search and add products above.</p>
        ) : (
          <div className="space-y-3">
            <LineItemsHeader />
            {cart.map((l, i) => (
              <div key={l.variant.shopifyVariantId}>
                <LineItemRow
                  product={
                    <div className="flex h-10 items-center text-sm text-zinc-800">
                      {variantLabel(l.variant)}
                    </div>
                  }
                  qty={
                    <Input
                      className="w-20"
                      type="number"
                      min="1"
                      value={String(l.quantity)}
                      onChange={(e) =>
                        setQty(
                          l.variant.shopifyVariantId,
                          Math.max(1, Math.floor(Number(e.target.value) || 1)),
                        )
                      }
                    />
                  }
                  unitPrice={
                    <div className="flex h-10 w-28 items-center justify-end px-2 text-sm tabular-nums text-zinc-700">
                      {fmtMoney(l.variant.priceCents)}
                    </div>
                  }
                  unitDiscountCents={l.variant.priceCents - netLines[i].netUnitPriceCents}
                  lineTotalCents={netLines[i].netLineTotalCents}
                  onRemove={() => remove(l.variant.shopifyVariantId)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <LineItemsTotal discountPercent={discountPercent} totalCents={totals.totalCents} />
      )}

      {addresses.length > 0 && (
        <div className="mt-4 border-t border-zinc-100 pt-4">
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            {split ? "Default ship-to" : "Ship to"}
          </label>
          <select
            value={addressId}
            onChange={(e) => setAddressId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
          >
            <option value="">— Select a delivery address —</option>
            {addresses.map((a) => (
              <option key={a.id} value={a.id}>
                {addressOptionLabel(a)}
                {a.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
          <label className="mt-2 flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={split}
              onChange={(e) => setSplit(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-300"
            />
            Split fulfillment — ship some items to different addresses
          </label>
          <p className="mt-1 text-xs text-zinc-400">
            {split
              ? "Add the locations below and enter how many of each item ships to each. One invoice and payment — we route each line at fulfillment."
              : "Your saved Shopify addresses. We’ll ship this order here."}
          </p>
          {split && cart.length > 0 && (
            <SplitFulfillmentGrid
              lines={cart.map((l) => ({
                shopifyVariantId: l.variant.shopifyVariantId,
                sku: l.variant.sku,
                label: variantLabel(l.variant),
                total: Math.max(1, l.quantity || 1),
              }))}
              addresses={addresses}
              locations={locations}
              alloc={alloc}
              onSetCell={setCell}
              onAddLocation={addLocation}
              onRemoveLocation={removeLocation}
            />
          )}
        </div>
      )}

      {/* No saved addresses: don't let the ship-to section vanish silently —
          tell the buyer what to expect so a sync gap is visible, not confusing. */}
      {addresses.length === 0 && cart.length > 0 && (
        <div className="mt-4 border-t border-zinc-100 pt-4">
          <p className="text-sm text-zinc-500">
            No saved delivery addresses on file yet — we’ll confirm where to ship
            after you submit. Need to ship to multiple locations? Mention it in
            your order and we’ll set up the split.
          </p>
        </div>
      )}

      {overAllocated && (
        <p className="mt-3 text-sm text-red-600">
          Some items have more allocated across locations than ordered — adjust the quantities to save.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {isSent ? (
        // An already-submitted (unpaid) order: saving regenerates its pay link.
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-zinc-400">
            Editing updates your {paymentMethod === "wire" ? "bank-wire total" : "payment link"}.
          </span>
          <Button onClick={() => send("save")} disabled={busy !== null || cart.length === 0 || overAllocated}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => send("save")}
            disabled={busy !== null || cart.length === 0 || overAllocated}
          >
            {busy === "save" ? "Saving…" : "Save draft"}
          </Button>
          {allowWirePayment && (
            <Button
              variant="outline"
              onClick={() => send("wire")}
              disabled={busy !== null || cart.length === 0 || overAllocated}
            >
              {busy === "wire" ? "Placing order…" : "Pay later by bank wire"}
            </Button>
          )}
          <Button onClick={() => send("card")} disabled={busy !== null || cart.length === 0 || overAllocated}>
            {busy === "card" ? "Starting checkout…" : "Checkout & pay"}
          </Button>
        </div>
      )}
    </Card>
  );
}
