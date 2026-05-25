"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductCombobox, variantLabel, type CatalogVariant } from "@/components/catalog/product-combobox";
import { computeInvoiceTotals } from "@/lib/invoicing/invoicing";
import { fmtMoney } from "@/lib/production/display";

interface CartLine {
  variant: CatalogVariant;
  quantity: number;
}

export function PortalOrder({
  variants,
  discountPercent,
}: {
  variants: CatalogVariant[];
  discountPercent: number;
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inCart = new Set(cart.map((l) => l.variant.shopifyVariantId));

  function add(v: CatalogVariant) {
    setError(null);
    setCart((c) =>
      c.some((l) => l.variant.shopifyVariantId === v.shopifyVariantId)
        ? c
        : [...c, { variant: v, quantity: 1 }],
    );
  }
  function setQty(id: string, qty: number) {
    setCart((c) => c.map((l) => (l.variant.shopifyVariantId === id ? { ...l, quantity: qty } : l)));
  }
  function remove(id: string) {
    setCart((c) => c.filter((l) => l.variant.shopifyVariantId !== id));
  }

  const totals = computeInvoiceTotals(
    cart.map((l) => ({ quantity: Math.max(0, l.quantity || 0), unitPriceCents: l.variant.priceCents })),
    discountPercent,
  );

  async function checkout() {
    if (cart.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineItems: cart.map((l) => ({
            shopifyVariantId: l.variant.shopifyVariantId,
            quantity: l.quantity,
          })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Checkout failed.");
        setBusy(false);
        return;
      }
      if (d.data?.payUrl) {
        // Off to Shopify checkout (Apple Pay / PayPal / card).
        window.location.href = d.data.payUrl;
      } else {
        window.location.href = "/portal/orders";
      }
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 p-6">
      <div className="flex items-center gap-2">
        <ProductCombobox
          variants={variants}
          value=""
          exclude={inCart}
          placeholder="Search products to add…"
          onSelect={add}
        />
      </div>

      <div className="mt-4">
        {cart.length === 0 ? (
          <p className="text-sm text-zinc-400">Your cart is empty. Search and add products above.</p>
        ) : (
          <div className="space-y-2">
            {cart.map((l) => (
              <div
                key={l.variant.shopifyVariantId}
                className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-100 px-3 py-2"
              >
                <span className="min-w-[200px] flex-1 text-sm text-zinc-800">
                  {variantLabel(l.variant)}
                </span>
                <span className="text-sm text-zinc-500">{fmtMoney(l.variant.priceCents)} ea</span>
                <Input
                  className="w-20"
                  type="number"
                  min="1"
                  value={String(l.quantity)}
                  onChange={(e) =>
                    setQty(l.variant.shopifyVariantId, Math.max(1, Math.floor(Number(e.target.value) || 1)))
                  }
                />
                <span className="w-24 text-right text-sm font-medium text-zinc-900">
                  {fmtMoney(l.variant.priceCents * l.quantity)}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remove"
                  onClick={() => remove(l.variant.shopifyVariantId)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-zinc-100 pt-3 text-sm">
          <div className="flex justify-end gap-6 text-zinc-500">
            <span>Subtotal</span>
            <span className="w-28 text-right text-zinc-700">{fmtMoney(totals.subtotalCents)}</span>
          </div>
          <div className="flex justify-end gap-6 text-zinc-500">
            <span>Your discount ({discountPercent}%)</span>
            <span className="w-28 text-right text-zinc-700">−{fmtMoney(totals.discountCents)}</span>
          </div>
          <div className="flex justify-end gap-6 text-base font-semibold text-zinc-900">
            <span>Total</span>
            <span className="w-28 text-right">{fmtMoney(totals.totalCents)}</span>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex justify-end">
        <Button onClick={checkout} disabled={busy || cart.length === 0}>
          {busy ? "Starting checkout…" : "Checkout & pay"}
        </Button>
      </div>
    </Card>
  );
}
