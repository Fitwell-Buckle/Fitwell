"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtMoney } from "@/lib/production/display";

export interface RecordInfluencer {
  id: string;
  name: string;
  handle: string | null;
}

interface Preview {
  shopifyOrderId: string;
  orderName: string;
  lineItems: {
    sku: string;
    title: string;
    quantity: number;
    unitPriceCents: number;
  }[];
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelled: boolean;
  alreadyImported: { id: string; orderNumber: string } | null;
}

const fieldLabel = "mb-1 block text-xs font-medium text-zinc-500";

export function RecordExistingOrderForm({
  influencers,
  defaultInfluencerId,
}: {
  influencers: RecordInfluencer[];
  defaultInfluencerId?: string;
}) {
  const router = useRouter();
  const [influencerId, setInfluencerId] = useState(defaultInfluencerId ?? "");
  const [orderName, setOrderName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [looking, setLooking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookup() {
    setError(null);
    setPreview(null);
    if (!orderName.trim()) return setError("Enter a Shopify order number.");
    setLooking(true);
    try {
      const res = await fetch(
        `/api/influencer-orders/shopify-lookup?name=${encodeURIComponent(orderName.trim())}`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Lookup failed.");
        return;
      }
      setPreview(json.data as Preview);
    } catch {
      setError("Network error — try again.");
    } finally {
      setLooking(false);
    }
  }

  async function record() {
    if (!preview) return;
    setError(null);
    if (!influencerId) return setError("Choose a creator to attach this order to.");
    setRecording(true);
    try {
      const res = await fetch(`/api/influencer-orders/import-shopify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencerId, orderName: orderName.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Couldn't record the order.");
        return;
      }
      toast.success(`Recorded as ${json.data.orderNumber}`);
      router.push(`/influencer-tracking/${json.data.id}`);
    } catch {
      setError("Network error — try again.");
    } finally {
      setRecording(false);
    }
  }

  const giftValue = preview
    ? preview.lineItems.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0)
    : 0;

  return (
    <div className="mt-6 space-y-5">
      <Card className="p-6">
        <h2 className="text-sm font-semibold text-zinc-900">
          Record an order that already exists in Shopify
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Enter the Shopify order number — we pull its line items, tracking
          number, and delivery status. No new draft is created.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={fieldLabel}>Creator</label>
            <select
              value={influencerId}
              onChange={(e) => setInfluencerId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
            >
              <option value="">Select a creator…</option>
              {influencers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.handle ? ` (@${i.handle})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={fieldLabel}>Shopify order number</label>
            <div className="flex gap-2">
              <Input
                placeholder="#1234"
                value={orderName}
                onChange={(e) => setOrderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void lookup();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={lookup} disabled={looking}>
                {looking ? "Looking…" : "Look up"}
              </Button>
            </div>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </Card>

      {preview && (
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">
              Shopify order {preview.orderName}
            </h2>
            <div className="flex items-center gap-2">
              {preview.cancelled && (
                <Badge className="bg-red-100 text-red-700">cancelled in Shopify</Badge>
              )}
              {preview.deliveredAt ? (
                <Badge className="bg-emerald-100 text-emerald-700">
                  delivered {preview.deliveredAt.slice(0, 10)}
                </Badge>
              ) : preview.shippedAt ? (
                <Badge className="bg-sky-100 text-sky-700">
                  shipped {preview.shippedAt.slice(0, 10)}
                </Badge>
              ) : (
                <Badge className="bg-zinc-100 text-zinc-600">not shipped yet</Badge>
              )}
            </div>
          </div>

          {preview.alreadyImported && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Already recorded as {preview.alreadyImported.orderNumber}.{" "}
              <button
                type="button"
                className="font-medium underline"
                onClick={() =>
                  router.push(`/influencer-tracking/${preview.alreadyImported!.id}`)
                }
              >
                Open it
              </button>
            </p>
          )}

          <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Item</th>
                  <th className="px-3 py-2 text-left font-medium">SKU</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {preview.lineItems.map((l, i) => (
                  <tr key={i} className="border-t border-zinc-100">
                    <td className="px-3 py-2">{l.title}</td>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-500">{l.sku || "—"}</td>
                    <td className="px-3 py-2 text-right">{l.quantity}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(l.unitPriceCents * l.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
            <span>
              {preview.trackingNumber ? (
                <>
                  Tracking:{" "}
                  {preview.trackingUrl ? (
                    <a
                      href={preview.trackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono underline-offset-2 hover:underline"
                    >
                      {preview.trackingNumber} ↗
                    </a>
                  ) : (
                    <span className="font-mono">{preview.trackingNumber}</span>
                  )}
                </>
              ) : (
                "No tracking number on the Shopify order yet."
              )}
            </span>
            <span>Gift value: {fmtMoney(giftValue)}</span>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <Button
              type="button"
              onClick={record}
              disabled={recording || !!preview.alreadyImported || !influencerId}
            >
              {recording ? "Recording…" : "Record this order"}
            </Button>
            {!influencerId && (
              <span className="text-xs text-zinc-400">Pick a creator above first.</span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
