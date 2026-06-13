"use client";

import { useState } from "react";
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
import { LineItemRow, LineItemsTotal } from "@/components/invoicing/line-item-row";
import type { CompanyAddress } from "@/lib/portal/addresses";

function addressOptionLabel(a: CompanyAddress): string {
  return [a.name || a.company, a.address1, a.city, a.provinceCode ?? a.province, a.zip]
    .filter(Boolean)
    .join(", ");
}

interface CartLine {
  variant: CatalogVariant;
  quantity: number;
  /** Per-line split-fulfillment address id ("" = ship to the order's default). */
  addressId: string;
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

interface SubmitResult {
  invoiceNumber: string;
  totalCents: number;
  paymentMethod: "card" | "wire";
  payUrl: string | null;
  instructions: string | null;
}

type Action = "save" | "card" | "wire";

function seedCart(items: InitialItem[]): CartLine[] {
  return items.map((it) => ({
    quantity: it.quantity,
    addressId: it.addressId ?? "",
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
  }));
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

  const [cart, setCart] = useState<CartLine[]>(seedCart(initialItems));
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  // Ship-to: pre-select the order's stored address, else the company default.
  const [addressId, setAddressId] = useState<string>(
    initialAddressId || addresses.find((a) => a.isDefault)?.id || "",
  );
  // Split fulfillment: when on, each line can ship to a different address.
  // Seeded on when any line already has its own ship-to.
  const [split, setSplit] = useState<boolean>(initialItems.some((it) => it.addressId));

  const inCart = new Set(cart.map((l) => l.variant.shopifyVariantId));
  const primaryLabel =
    addresses.find((a) => a.id === addressId) != null
      ? addressOptionLabel(addresses.find((a) => a.id === addressId)!)
      : null;

  function add(v: CatalogVariant) {
    setError(null);
    setCart((c) =>
      c.some((l) => l.variant.shopifyVariantId === v.shopifyVariantId)
        ? c
        : [...c, { variant: v, quantity: 1, addressId: "" }],
    );
  }
  function addMany(vs: CatalogVariant[]) {
    setError(null);
    setCart((c) => {
      const have = new Set(c.map((l) => l.variant.shopifyVariantId));
      const next = [...c];
      for (const v of vs) {
        if (!have.has(v.shopifyVariantId)) {
          next.push({ variant: v, quantity: 1, addressId: "" });
          have.add(v.shopifyVariantId);
        }
      }
      return next;
    });
  }
  function setQty(id: string, qty: number) {
    setCart((c) => c.map((l) => (l.variant.shopifyVariantId === id ? { ...l, quantity: qty } : l)));
  }
  function setLineAddress(id: string, aId: string) {
    setCart((c) => c.map((l) => (l.variant.shopifyVariantId === id ? { ...l, addressId: aId } : l)));
  }
  function remove(id: string) {
    setCart((c) => c.filter((l) => l.variant.shopifyVariantId !== id));
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
    if (cart.length === 0) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(isEdit ? `/api/portal/orders/${orderId}` : "/api/portal/orders", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submit: action === "save" ? undefined : action,
          addressId,
          lineItems: cart.map((l) => ({
            shopifyVariantId: l.variant.shopifyVariantId,
            quantity: l.quantity,
            // Per-line override only when split is on (else ships to the default).
            addressId: split ? l.addressId || undefined : undefined,
          })),
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
    // Submitted (status "sent").
    if (data.paymentMethod === "card" && action !== "save") {
      // Explicit "pay now" → straight to Shopify checkout.
      window.location.href = data.payUrl as string;
      return;
    }
    // Wire submit, or an edit-and-save of an already-sent order: show a
    // confirmation with the (new) total + how to pay.
    setResult({
      invoiceNumber: data.invoiceNumber as string,
      totalCents: (data.totalCents as number) ?? totals.totalCents,
      paymentMethod: (data.paymentMethod as "card" | "wire") ?? "card",
      payUrl: (data.payUrl as string) ?? null,
      instructions: (data.wireInstructions as string) ?? null,
    });
    setBusy(null);
  }

  if (result) {
    return (
      <Card className="mt-6 p-6">
        <h2 className="text-base font-semibold text-zinc-900">
          Order {result.invoiceNumber} {isSent ? "updated" : "placed"}
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Total due: <span className="font-medium text-zinc-900">{fmtMoney(result.totalCents)}</span>.
        </p>
        {result.paymentMethod === "wire" ? (
          result.instructions ? (
            <pre className="mt-4 whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-800">
              {result.instructions}
            </pre>
          ) : (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Please pay by bank wire — we’ll email you the details shortly.
            </p>
          )
        ) : (
          <p className="mt-3 text-sm text-zinc-600">
            Your payment link has been updated to reflect the new total.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {result.paymentMethod === "card" && result.payUrl && (
            <Button asChild>
              <a href={result.payUrl}>Pay now</a>
            </Button>
          )}
          <Button asChild variant="ghost">
            <a href="/portal/orders">Back to your orders</a>
          </Button>
        </div>
      </Card>
    );
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
                {split && addresses.length > 0 && (
                  <div className="mt-1 flex items-center gap-2 pl-1">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                      Ship to
                    </span>
                    <select
                      value={l.addressId}
                      onChange={(e) => setLineAddress(l.variant.shopifyVariantId, e.target.value)}
                      className="h-9 max-w-[480px] flex-1 rounded-md border border-zinc-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300"
                    >
                      <option value="">
                        Same as default{primaryLabel ? ` — ${primaryLabel}` : ""}
                      </option>
                      {addresses.map((a) => (
                        <option key={a.id} value={a.id}>
                          {addressOptionLabel(a)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
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
              ? "Pick a destination per line above; lines left on “Same as default” ship to the address selected here. One invoice and payment — we route each line at fulfillment."
              : "Your saved Shopify addresses. We’ll ship this order here."}
          </p>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {isSent ? (
        // An already-submitted (unpaid) order: saving regenerates its pay link.
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-zinc-400">
            Editing updates your {paymentMethod === "wire" ? "bank-wire total" : "payment link"}.
          </span>
          <Button onClick={() => send("save")} disabled={busy !== null || cart.length === 0}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => send("save")}
            disabled={busy !== null || cart.length === 0}
          >
            {busy === "save" ? "Saving…" : "Save draft"}
          </Button>
          {allowWirePayment && (
            <Button
              variant="outline"
              onClick={() => send("wire")}
              disabled={busy !== null || cart.length === 0}
            >
              {busy === "wire" ? "Placing order…" : "Pay later by bank wire"}
            </Button>
          )}
          <Button onClick={() => send("card")} disabled={busy !== null || cart.length === 0}>
            {busy === "card" ? "Starting checkout…" : "Checkout & pay"}
          </Button>
        </div>
      )}
    </Card>
  );
}
