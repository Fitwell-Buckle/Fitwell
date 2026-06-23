"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Box, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FinishViewer } from "@/components/cad/finish-viewer";

interface ReadyModel {
  id: string;
  name: string;
  glbUrl: string | null;
}

export function ProductCadModelCard({
  sku,
  readyModels,
  initialCadModelId,
  shopifyPublishedAt,
  defaultFinishId,
}: {
  sku: string;
  readyModels: ReadyModel[];
  initialCadModelId: string | null;
  shopifyPublishedAt: string | null;
  // Finish auto-matched from this product's color (e.g. "Natural (silver)").
  defaultFinishId: string | null;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string>(initialCadModelId ?? "");
  const [onShopify, setOnShopify] = useState<boolean>(Boolean(shopifyPublishedAt));
  const [shopifyBusy, setShopifyBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = readyModels.find((m) => m.id === selectedId) ?? null;

  async function link(cadModelId: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(sku)}/cad-model`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cadModelId: cadModelId || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed to link model.");
        return;
      }
      setSelectedId(cadModelId);
      setOnShopify(false);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function pushShopify() {
    setError(null);
    setShopifyBusy(true);
    try {
      const res = await fetch(
        `/api/products/${encodeURIComponent(sku)}/cad-model/shopify`,
        { method: "POST" },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Shopify push failed.");
        return;
      }
      setOnShopify(true);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setShopifyBusy(false);
    }
  }

  return (
    <Card className="mt-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
          <Box className="h-4 w-4 text-zinc-400" /> 3D model
        </h2>
        {onShopify && (
          <Badge className="bg-green-100 text-green-700">
            <Check className="mr-1 h-3 w-3" /> On Shopify
          </Badge>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            CAD model
          </label>
          <select
            value={selectedId}
            onChange={(e) => link(e.target.value)}
            disabled={busy}
            className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
          >
            <option value="">— None —</option>
            {readyModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={pushShopify} disabled={shopifyBusy || !selectedId}>
          {shopifyBusy ? "Pushing…" : "Push to Shopify"}
        </Button>
      </div>

      <p className="mt-2 text-xs text-zinc-500">
        Pick a model from your{" "}
        <Link
          href="/products/cad-models"
          className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
        >
          CAD library
        </Link>{" "}
        (color variants share one model), then push its spinnable 3D viewer to
        the Shopify product.
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {selected?.glbUrl && (
        <div className="mt-4">
          <FinishViewer
            src={selected.glbUrl}
            alt={`${selected.name} 3D model`}
            initialFinishId={defaultFinishId}
          />
        </div>
      )}
    </Card>
  );
}
