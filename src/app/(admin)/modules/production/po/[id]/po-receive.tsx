"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PackageCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const REASON: Record<string, string> = {
  not_ready: "still in production",
  no_variant: "no Shopify variant linked",
  no_warehouse: "no warehouse set",
  already_received: "already received",
};

interface ReceiveResult {
  poFullyReceived: boolean;
  received: { lineItemId: string; sku: string; available?: number }[];
  skipped: { lineItemId: string; sku: string; status: string }[];
  failed: { lineItemId: string; sku: string; error: string }[];
}

export function PoReceive({
  poId,
  receivedAt,
}: {
  poId: string;
  receivedAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [result, setResult] = useState<ReceiveResult | null>(null);

  async function receive() {
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch(`/api/production/po/${poId}/receive`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Receive failed.");
      } else {
        setResult(data.data as ReceiveResult);
        setHint(data.hint ?? null);
        if (data.data?.poFullyReceived) router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (receivedAt) {
    return (
      <Card className="mt-5 border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          Received into Shopify on {receivedAt}.
        </div>
      </Card>
    );
  }

  return (
    <Card className="mt-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Receive into Shopify</h2>
          <p className="mt-1 max-w-xl text-xs text-zinc-500">
            Push each line item&apos;s quantity to its warehouse as a Shopify inventory
            adjustment. Each line is received once — re-running only sends lines that
            haven&apos;t been received yet.
          </p>
        </div>
        <Button onClick={receive} disabled={busy}>
          <PackageCheck className="h-4 w-4" />
          {busy ? "Receiving…" : "Receive into Shopify"}
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {hint && (
        <p className="mt-3 rounded-md bg-amber-50 p-2.5 text-sm text-amber-800">{hint}</p>
      )}

      {result && (
        <div className="mt-3 space-y-1 text-sm">
          <p className="text-zinc-700">
            Received {result.received.length} line item
            {result.received.length === 1 ? "" : "s"}
            {result.poFullyReceived ? " — PO fully received." : "."}
          </p>
          {result.skipped.length > 0 && (
            <p className="text-zinc-500">
              Skipped:{" "}
              {result.skipped
                .map((s) => `${s.sku} (${REASON[s.status] ?? s.status})`)
                .join(", ")}
            </p>
          )}
          {result.failed.length > 0 && (
            <p className="text-red-600">
              Failed: {result.failed.map((f) => f.sku).join(", ")}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
