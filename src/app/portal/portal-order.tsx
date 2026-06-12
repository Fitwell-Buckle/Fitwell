"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ProductCombobox,
  variantLabel,
  type CatalogVariant,
  type CatalogCollection,
} from "@/components/catalog/product-combobox";
import { computeInvoiceTotals } from "@/lib/invoicing/invoicing";
import { fmtMoney } from "@/lib/production/display";

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
  orderId,
  status,
  paymentMethod,
  initialItems = [],
}: {
  variants: CatalogVariant[];
  collections: CatalogCollection[];
  discountPercent: number;
  allowWirePayment: boolean;
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

  const inCart = new Set(cart.map((l) => l.variant.shopifyVariantId));

  // The customer's discounted unit price (the tier % off retail). Shown beside
  // the standard price so they can see what they actually pay.
  const discountedUnit = (priceCents: number) =>
    Math.round((priceCents * (100 - discountPercent)) / 100);

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

  const totals = computeInvoiceTotals(
    cart.map((l) => ({ quantity: Math.max(0, l.quantity || 0), unitPriceCents: l.variant.priceCents })),
    discountPercent,
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
          lineItems: cart.map((l) => ({
            shopifyVariantId: l.variant.shopifyVariantId,
            quantity: l.quantity,
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
          <div className="space-y-2">
            {cart.map((l) => (
              <div
                key={l.variant.shopifyVariantId}
                className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-100 px-3 py-2"
              >
                <span className="min-w-[200px] flex-1 text-sm text-zinc-800">
                  {variantLabel(l.variant)}
                </span>
                <span className="text-sm text-zinc-500">
                  {discountPercent > 0 ? (
                    <>
                      <span className="text-zinc-400 line-through">
                        {fmtMoney(l.variant.priceCents)}
                      </span>{" "}
                      <span className="font-medium text-emerald-700">
                        {fmtMoney(discountedUnit(l.variant.priceCents))} ea
                      </span>
                    </>
                  ) : (
                    <>{fmtMoney(l.variant.priceCents)} ea</>
                  )}
                </span>
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
